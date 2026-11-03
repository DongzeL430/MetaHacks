import { useEffect, useId, useState } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import AvailabilityCalendar from './AvailabilityCalendar';
import CoursesSection, { validateAcademics } from './CoursesSection';
import type { AcademicProfile, CourseEntry } from './CoursesSection';
import MultipleChoiceSection from './MultipleChoiceSection';
import PersonAvatar from './PersonAvatar';
import ViewTabs, { viewPanelId, viewTabId } from './ViewTabs';
import { PROFILE_LIMITS } from '../dataFiles/StudyData';
import type { MyProfile } from '../dataFiles/StudyData';
import { SURVEY_SECTIONS } from '../dataFiles/SurveySections';

type Section = 'profile' | 'courses' | 'answers' | 'schedule' | 'contact' | 'account';

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'profile', label: 'Profile' },
  { id: 'courses', label: 'Courses' },
  { id: 'answers', label: 'Answers' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'contact', label: 'Contact' },
  { id: 'account', label: 'Account' },
];

interface ProfileEditorWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  /** The saved profile. Edits stay a draft until Save. */
  profile: MyProfile;
  /**
   * Saves the profile. Throw to show an error; the draft is kept so nothing is lost.
   * Return the profile as saved to show what the backend changed (matched course names…).
   */
  onSave: (profile: MyProfile) => void | MyProfile | Promise<void | MyProfile>;
  /** The avatar Muse drew from the nickname. Initials show without one. */
  avatarUrl?: string;
  /** Nickname and avatar changes left today (they share a daily limit), or null if unknown */
  changesLeft?: number | null;
  /** Muse draws a new avatar from the saved nickname. Throw to show an error. */
  onRedrawAvatar?: () => Promise<void>;
  onLogOut?: () => void;
  /** Deletes the account. Throw to show an error. */
  onDeleteAccount?: () => Promise<void>;
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

/** The course list in the shape the pre-survey's Courses section edits */
const asAcademics = (courses: CourseEntry[]): AcademicProfile => ({ majors: [], minors: [], year: '', gradYear: '', courses });

const QUESTIONS = SURVEY_SECTIONS.flatMap((s) => s.questions);

/** Trims text before saving */
function tidy(p: MyProfile): MyProfile {
  return {
    ...p,
    nickname: p.nickname.trim(),
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

/* ---------- Window ---------- */

/**
 * Edit your own profile, in sections like the Sessions window: Profile, Courses, Answers (the
 * pre-survey's questions), Schedule, Contact, Account.
 * Changes are a draft until Save; Undo changes goes back to what's saved. Reopening starts fresh.
 */
export default function ProfileEditorWindow({
  id,
  open,
  onClose,
  profile,
  onSave,
  avatarUrl,
  changesLeft = null,
  onRedrawAvatar,
  onLogOut,
  onDeleteAccount,
}: ProfileEditorWindowProps) {
  const baseId = useId();
  const [section, setSection] = useState<Section>('profile');
  const [draft, setDraft] = useState<MyProfile>(profile);
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; text: string } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [drawNote, setDrawNote] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteText, setDeleteText] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const outOfChanges = changesLeft === 0;
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
  const courseProblem = validateAcademics(asAcademics(draft.courses));
  const unanswered = new Set(QUESTIONS.filter((q) => !draft.answers[q.id]).map((q) => q.id));
  // What still needs fixing in each section
  const problemCounts: Partial<Record<Section, number>> = {
    profile: problems.nickname ? 1 : 0,
    courses: courseProblem?.missing.size ?? 0,
    answers: unanswered.size,
    contact: (['discord', 'instagram', 'phone'] as const).filter((f) => problems[f]).length,
  };
  const dirty = !same(draft, profile);

  const update = (patch: Partial<MyProfile>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setStatus(null);
  };
  const updateContact = (patch: Partial<MyProfile['contact']>) => update({ contact: { ...draft.contact, ...patch } });

  const save = async () => {
    const firstProblem = SECTIONS.find((s) => (problemCounts[s.id] ?? 0) > 0);
    if (firstProblem) {
      setShowProblems(true);
      // Jump to the section with the first problem
      setSection(firstProblem.id);
      return;
    }
    setSaving(true);
    try {
      const clean = tidy(draft);
      const saved = await onSave(clean);
      setDraft(saved ?? clean);
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

  const redraw = async () => {
    if (!onRedrawAvatar) return;
    setDrawing(true);
    setDrawNote({ kind: 'ok', text: 'Muse is drawing your avatar. This takes about half a minute.' });
    try {
      await onRedrawAvatar();
      setDrawNote({ kind: 'ok', text: 'Here’s your new avatar.' });
    } catch (err) {
      setDrawNote({ kind: 'error', text: err instanceof Error ? err.message : 'Muse couldn’t draw one right now.' });
    } finally {
      setDrawing(false);
    }
  };

  const deleteAccount = async () => {
    if (!onDeleteAccount) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await onDeleteAccount();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Your account wasn’t deleted. Try again.');
      setDeleting(false);
    }
  };

  const changesNote =
    changesLeft === null
      ? 'Nickname and avatar changes share a limit of 3 a day.'
      : `${changesLeft} of 3 nickname or avatar changes left today.`;

  const errorId = (field: string) => `${baseId}-${field}-error`;
  const sectionCounts = showProblems ? problemCounts : {};

  return (
    <AppWindow
      id={id}
      title="Profile"
      accent={WINDOW_ACCENTS.sand}
      info="Edit how you show up to other students and what StudBuds uses to match you: your nickname and avatar, your courses and survey answers, your free time, and contact details you can choose to share."
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
              {/* The drawing is its own square tile, so it shows as is, without the round frame */}
              {avatarUrl ? (
                // doodle.css frames every image; the utilities turn that off here
                <img
                  src={avatarUrl}
                  alt="Your avatar"
                  className="w-24 h-24 shrink-0 object-contain rounded-none border-0 [border-image:none]"
                />
              ) : (
                <PersonAvatar person={{ id: 'me', name: draft.nickname || '?' }} className="w-20 h-20" />
              )}
              <div className="flex flex-col items-start gap-1.5">
                <p className="m-0 text-sm opacity-70">This is how you appear in lobbies and in the nav bar.</p>
                {onRedrawAvatar && (
                  <button
                    type="button"
                    onClick={() => void redraw()}
                    disabled={drawing || outOfChanges}
                    title="Muse draws a new avatar from your saved nickname"
                    className="px-3 py-0.5 text-sm"
                  >
                    {drawing ? 'Drawing…' : 'Draw a new avatar'}
                  </button>
                )}
              </div>
            </div>
            {drawNote && (
              <p role="status" className={`m-0 text-sm ${drawNote.kind === 'error' ? 'text-danger' : 'opacity-70'}`}>
                {drawNote.text}
              </p>
            )}

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
              <span className="text-xs opacity-70">
                Classmates see this, so skip your real name. Saving a new one uses a daily change; then “Draw a
                new avatar” to match it.
              </span>
            </div>

            <p className="m-0 text-sm opacity-70">{changesNote}</p>
          </>
        )}

        {section === 'courses' && (
          <CoursesSection
            value={asAcademics(draft.courses)}
            onChange={(next) => update({ courses: next.courses })}
            missing={showProblems ? courseProblem?.missing : undefined}
            notice="When you save, Muse matches new course names to your school’s catalog."
          />
        )}

        {section === 'answers' && (
          <>
            <p className="m-0 text-sm opacity-70">Your pre-survey answers. Matching uses them to find study partners.</p>
            {SURVEY_SECTIONS.map((s) => (
              <section key={s.id} className="flex flex-col gap-1">
                <h3 className="m-0 px-2 text-xl">{s.title}</h3>
                <MultipleChoiceSection
                  section={s}
                  values={draft.answers}
                  missing={showProblems ? unanswered : undefined}
                  onAnswer={(questionId, option) => update({ answers: { ...draft.answers, [questionId]: option } })}
                />
              </section>
            ))}
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

        {section === 'account' && (
          <>
            {onLogOut && (
              <div className="flex flex-col items-start gap-1">
                <button type="button" onClick={onLogOut} className="px-4 py-1">
                  Log out
                </button>
              </div>
            )}

            {onDeleteAccount && (
              <div className="flex flex-col gap-2 pt-3 border-t-2 border-ink/15">
                {confirmingDelete ? (
                  <>
                    <p className="m-0 text-sm">This deletes your account and everything tied to you. It can’t be undone.</p>
                    <label className="flex flex-col gap-1 text-sm">
                      Type DELETE to confirm:
                      <input
                        type="text"
                        value={deleteText}
                        onChange={(e) => setDeleteText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && e.preventDefault()}
                        autoComplete="off"
                        className={INPUT}
                      />
                    </label>
                    {deleteError && (
                      <p role="alert" className="m-0 text-sm text-danger">
                        {deleteError}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void deleteAccount()}
                        disabled={deleteText !== 'DELETE' || deleting}
                        className="px-3 py-0.5 text-sm"
                      >
                        {deleting ? 'Deleting…' : 'Delete my account'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setConfirmingDelete(false);
                          setDeleteText('');
                          setDeleteError('');
                        }}
                        className="px-3 py-0.5 text-sm"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <button type="button" onClick={() => setConfirmingDelete(true)} className="self-start px-3 py-0.5 text-sm">
                    Delete my account
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </AppWindow>
  );
}