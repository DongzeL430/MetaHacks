import { useEffect, useId, useState } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import AvailabilityCalendar from './AvailabilityCalendar';
import { DoodleCombobox, DoodleSelect } from './DoodleSelect';
import PersonAvatar from './PersonAvatar';
import ViewTabs, { viewPanelId, viewTabId } from './ViewTabs';
import { AVATAR_ANIMALS, PROFILE_LIMITS, SUBJECT_SUGGESTIONS } from '../dataFiles/StudyData';
import type { MyProfile } from '../dataFiles/StudyData';

type Section = 'profile' | 'study' | 'schedule' | 'contact';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'study', label: 'Study' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'contact', label: 'Contact' },
];

interface ProfileEditorWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  /** The saved profile. Edits stay a draft until Save. */
  profile: MyProfile;
  /** Saves the profile. Throw to show an error; the draft is kept so nothing is lost. */
  onSave: (profile: MyProfile) => void | Promise<void>;
}

const LABEL = 'flex flex-col gap-1';
const INPUT = 'w-full px-2 py-1';

/* ---------- Checks ---------- */

type Problems = Partial<Record<'nickname' | 'discord' | 'instagram' | 'phone', string>>;

function findProblems(p: MyProfile): Problems {
  const problems: Problems = {};
  const nick = p.nickname.trim();
  if (nick.length < PROFILE_LIMITS.nicknameMin || nick.length > PROFILE_LIMITS.nicknameMax) {
    problems.nickname = `Use ${PROFILE_LIMITS.nicknameMin} to ${PROFILE_LIMITS.nicknameMax} characters.`;
  }
  if (p.contact.instagram && !/^@?[A-Za-z0-9._]{1,30}$/.test(p.contact.instagram.trim())) {
    problems.instagram = 'Only letters, numbers, periods and underscores.';
  }
  if (p.contact.phone && !/^[+()\-.\s0-9]{7,20}$/.test(p.contact.phone.trim())) {
    problems.phone = 'Use digits, spaces, and + ( ) - only.';
  }
  if (p.contact.discord && p.contact.discord.trim().length > PROFILE_LIMITS.discordMax) {
    problems.discord = `Up to ${PROFILE_LIMITS.discordMax} characters.`;
  }
  return problems;
}

/** Trims text and removes empty or repeated tags before saving */
function tidy(p: MyProfile): MyProfile {
  const cleanTags = (tags: string[]) => {
    const seen = new Set<string>();
    return tags
      .map((t) => t.trim())
      .filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()));
  };
  return {
    ...p,
    nickname: p.nickname.trim(),
    seekingHelpWith: cleanTags(p.seekingHelpWith),
    coursesTaken: cleanTags(p.coursesTaken),
    contact: {
      discord: p.contact.discord.trim(),
      instagram: p.contact.instagram.trim().replace(/^@/, ''),
      phone: p.contact.phone.trim(),
    },
  };
}

const same = (a: MyProfile, b: MyProfile) => JSON.stringify(tidy(a)) === JSON.stringify(tidy(b));

/* ---------- Small pieces ---------- */

function FieldError({ id, children }: { id: string; children: string }) {
  return (
    <span id={id} role="alert" className="text-sm text-danger">
      {children}
    </span>
  );
}

/** A list of subjects as removable chips, plus a box (with suggestions) to add more */
function TagEditor({
  label,
  tags,
  onChange,
  placeholder,
}: {
  label: string;
  tags: string[];
  onChange: (tags: string[]) => void;
  placeholder: string;
}) {
  const fieldId = useId();
  const [draft, setDraft] = useState('');
  const full = tags.length >= PROFILE_LIMITS.maxTags;

  const add = (value: string) => {
    const tag = value.trim().slice(0, PROFILE_LIMITS.tagMax);
    if (!tag || full) return;
    if (!tags.some((t) => t.toLowerCase() === tag.toLowerCase())) onChange([...tags, tag]);
    setDraft('');
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-sm">
        {label}
      </label>

      {tags.length > 0 && (
        <ul className="m-0 p-0 list-none flex flex-wrap gap-2">
          {tags.map((tag) => (
            <li key={tag} className="list-none flex items-center gap-1 pl-2.5 pr-1 py-0.5 rounded-md border-2 border-ink/30 bg-paper text-sm">
              {tag}
              <button
                type="button"
                onClick={() => onChange(tags.filter((t) => t !== tag))}
                aria-label={`Remove ${tag}`}
                className="w-5 h-5 p-0 flex items-center justify-center rounded border-0 [border-image:none] bg-transparent hover:bg-busy"
              >
                <svg viewBox="0 0 20 20" className="w-3 h-3" aria-hidden="true">
                  <path d="M5 5l10 10M15 5L5 15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2">
        <div className="flex-1 min-w-0">
          <DoodleCombobox
            id={fieldId}
            value={draft}
            onChange={setDraft}
            suggestions={SUBJECT_SUGGESTIONS.filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))}
            onPick={add}
            onSubmit={() => add(draft)}
            placeholder={full ? `Up to ${PROFILE_LIMITS.maxTags} entries` : placeholder}
            maxLength={PROFILE_LIMITS.tagMax}
          />
        </div>
        <button type="button" onClick={() => add(draft)} disabled={!draft.trim() || full} className="px-3 py-0.5 text-sm">
          Add
        </button>
      </div>
    </div>
  );
}

/* ---------- Window ---------- */

/**
 * Edit your own profile, in sections like the Sessions window: Profile, Study, Schedule, Contact.
 * Changes are a draft until Save; Undo changes goes back to what's saved. Reopening starts fresh.
 */
export default function ProfileEditorWindow({ id, open, onClose, profile, onSave }: ProfileEditorWindowProps) {
  const baseId = useId();
  const [section, setSection] = useState<Section>('profile');
  const [draft, setDraft] = useState<MyProfile>(profile);
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);
  // Remounts the calendar when the draft is reset, so it shows the right slots
  const [calendarKey, setCalendarKey] = useState(0);

  // Fresh draft from the saved profile every time the window opens
  useEffect(() => {
    if (!open) return;
    setDraft(profile);
    setShowProblems(false);
    setStatus(null);
    setCalendarKey((k) => k + 1);
    // Only when opening: later saves update `profile` without wiping in-progress edits
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const problems = findProblems(draft);
  const shown = showProblems ? problems : {};
  const dirty = !same(draft, profile);

  const update = (patch: Partial<MyProfile>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setStatus(null);
  };
  const updateContact = (patch: Partial<MyProfile['contact']>) => update({ contact: { ...draft.contact, ...patch } });

  const save = async () => {
    if (Object.keys(problems).length > 0) {
      setShowProblems(true);
      // Jump to the section with the first problem
      setSection(problems.nickname ? 'profile' : 'contact');
      return;
    }
    setSaving(true);
    try {
      const clean = tidy(draft);
      await onSave(clean);
      setDraft(clean);
      setShowProblems(false);
      setStatus({ kind: 'saved', text: 'Saved.' });
    } catch (err) {
      setStatus({ kind: 'error', text: err instanceof Error ? err.message : 'Couldn’t save right now. Try again in a moment.' });
    } finally {
      setSaving(false);
    }
  };

  const undo = () => {
    setDraft(profile);
    setShowProblems(false);
    setStatus(null);
    setCalendarKey((k) => k + 1);
  };

  const errorId = (field: string) => `${baseId}-${field}-error`;
  const sectionCounts: Partial<Record<Section, number>> = {
    profile: shown.nickname ? 1 : 0,
    contact: ['discord', 'instagram', 'phone'].filter((f) => shown[f as keyof Problems]).length,
  };

  return (
    <AppWindow
      id={id}
      title="Profile"
      accent={WINDOW_ACCENTS.sand}
      info="Edit how you show up to other students and what StudBuds uses to match you: your nickname and avatar, your subjects, your free time, and contact details you can choose to share."
      open={open}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'enabled' }}
      minWidth={300}
      minHeight={320}
      bodyClassName="p-3 flex flex-col gap-3"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <p
            role="status"
            className={`m-0 flex-1 min-w-[8rem] text-sm ${status?.kind === 'error' ? 'text-danger' : 'opacity-70'}`}
          >
            {status?.text ?? (dirty ? 'Unsaved changes' : '')}
          </p>
          <button type="button" onClick={undo} disabled={!dirty || saving} className="px-3 py-0.5 text-sm">
            Undo changes
          </button>
          <button type="button" onClick={() => void save()} disabled={!dirty || saving} className="px-3 py-0.5 text-sm">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }
    >
      <ViewTabs
        baseId={baseId}
        label="Profile sections"
        // Count badges show which sections still need fixing after a Save attempt
        tabs={SECTIONS.map((s) => ({ id: s.id, label: s.label, count: sectionCounts[s.id] }))}
        value={section}
        onChange={setSection}
      />

      <div
        key={section}
        role="tabpanel"
        id={viewPanelId(baseId)}
        aria-labelledby={viewTabId(baseId, section)}
        className="flex flex-col gap-4 motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
      >
        {section === 'profile' && (
          <>
            <div className="flex items-center gap-3">
              <PersonAvatar person={{ id: 'me', name: draft.nickname || '?' }} className="w-16 h-16" />
              <p className="m-0 text-sm opacity-70">This is how you appear in lobbies and in the nav bar.</p>
            </div>

            <div className={LABEL}>
              <label htmlFor={`${baseId}-nickname`} className="text-sm">
                Nickname
              </label>
              <input
                id={`${baseId}-nickname`}
                type="text"
                value={draft.nickname}
                onChange={(e) => update({ nickname: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                maxLength={PROFILE_LIMITS.nicknameMax}
                autoComplete="off"
                aria-invalid={!!shown.nickname || undefined}
                aria-describedby={shown.nickname ? errorId('nickname') : undefined}
                style={shown.nickname ? { outline: '2px dashed var(--color-danger-strong)', outlineOffset: -8 } : undefined}
                className={INPUT}
              />
              {shown.nickname && <FieldError id={errorId('nickname')}>{shown.nickname}</FieldError>}
            </div>

            <div className={`${LABEL} self-start`}>
              <label htmlFor={`${baseId}-animal`} className="text-sm">
                Avatar animal
              </label>
              <DoodleSelect
                id={`${baseId}-animal`}
                value={draft.animal}
                onChange={(animal) => update({ animal })}
                options={AVATAR_ANIMALS.map((a) => ({ value: a, label: a }))}
                className="w-48 max-w-full"
              />
            </div>
          </>
        )}

        {section === 'study' && (
          <>
            <TagEditor
              label="Subjects I’d like help with"
              tags={draft.seekingHelpWith}
              onChange={(seekingHelpWith) => update({ seekingHelpWith })}
              placeholder="e.g. Linear Algebra"
            />
            <TagEditor
              label="Courses I’ve taken"
              tags={draft.coursesTaken}
              onChange={(coursesTaken) => update({ coursesTaken })}
              placeholder="e.g. Calculus I"
            />
            <p className="m-0 text-xs opacity-70">These help match you with lobbies and study partners.</p>
          </>
        )}

        {section === 'schedule' && (
          <>
            <p className="m-0 text-sm opacity-70">
              Drag across the times you’re usually free. Lobby filters and the host form use this.
            </p>
            <AvailabilityCalendar
              key={calendarKey}
              defaultValue={draft.availability}
              onChange={(availability) => update({ availability })}
            />
          </>
        )}

        {section === 'contact' && (
          <>
            <p className="m-0 text-sm opacity-70">
              All optional. These are never shown on your card; they’re only shared with someone if you choose to.
            </p>
            {(
              [
                { key: 'discord', label: 'Discord', placeholder: 'yourname', max: PROFILE_LIMITS.discordMax, type: 'text' },
                { key: 'instagram', label: 'Instagram', placeholder: '@yourname', max: PROFILE_LIMITS.instagramMax + 1, type: 'text' },
                { key: 'phone', label: 'Phone', placeholder: '(555) 123-4567', max: PROFILE_LIMITS.phoneMax, type: 'tel' },
              ] as const
            ).map((f) => (
              <div key={f.key} className={LABEL}>
                <label htmlFor={`${baseId}-${f.key}`} className="text-sm">
                  {f.label} <span className="opacity-60">(optional)</span>
                </label>
                <input
                  id={`${baseId}-${f.key}`}
                  type={f.type}
                  value={draft.contact[f.key]}
                  onChange={(e) => updateContact({ [f.key]: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                  placeholder={f.placeholder}
                  maxLength={f.max}
                  autoComplete="off"
                  aria-invalid={!!shown[f.key] || undefined}
                  aria-describedby={shown[f.key] ? errorId(f.key) : undefined}
                  style={shown[f.key] ? { outline: '2px dashed var(--color-danger-strong)', outlineOffset: -8 } : undefined}
                  className={INPUT}
                />
                {shown[f.key] && <FieldError id={errorId(f.key)}>{shown[f.key]!}</FieldError>}
              </div>
            ))}
          </>
        )}
      </div>
    </AppWindow>
  );
}