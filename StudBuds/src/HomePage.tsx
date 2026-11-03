import { useCallback, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { WindowLayer, WindowManagerProvider } from './components/AppWindow';
import Taskbar, { TASKBAR_CLEARANCE } from './components/Taskbar';
import type { TaskbarApp } from './components/Taskbar';
import StudyLayout from './components/StudyLayout';
import ThemePromptWindow from './components/ThemePromptWindow';
import { useUserTheme } from './utils/UserTheme';
import { FALLBACK_MUSIC, defaultMusicFor } from './utils/Music';
import { useThemeMusic } from './utils/MusicPlayer';
import ProfileEditorWindow from './components/ProfileEditorWindow';
import Tour from './components/Tour';
import { welcomeTourSteps } from './components/WelcomeTourSteps';
import CroftWindow from './components/croft/CroftWindow';
import WorldChat from './components/WorldChat';
import { useWorldChat } from './lib/worldChat';
import { CroftVisitContext } from './lib/croft';
import type { MyProfile } from './dataFiles/StudyData';
import { ME } from './dataFiles/StudyData';
import type { Person } from './dataFiles/StudyData';
import { pendingInvites, useStudyState } from './utils/StudyState';
import type { StudyAction, StudyState } from './utils/StudyState';
// Same background picture as the auth page: picked at random once per session.
// The default background picture. A custom theme can swap it, tint it, or move its focus point.
import { defaultBackground as defaultbg, defaultBackgroundName } from './utils/DefaultBackground.ts';

/* Taskbar icons (drawn at 24x24, sized by the taskbar) */
const SessionsIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="5" width="17" height="15" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4M8 14h3" />
  </svg>
);

const LobbiesIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 20c.8-3.8 3.4-5.5 6.5-5.5s5.7 1.7 6.5 5.5" />
    <circle cx="17" cy="9" r="2.8" />
    <path d="M16.5 14.6c2.6.2 4.4 1.8 5 4.9" />
  </svg>
);

const LinkIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5" />
    <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5" />
  </svg>
);

/** An hourglass, for features on the way */
const UpcomingIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 3h12M6 21h12" />
    <path d="M7 3c0 5 10 5 10 9s-10 4-10 9M17 3c0 5-10 5-10 9s10 4 10 9" />
  </svg>
);

const EMPTY_STUDY_STATE: StudyState = { lobbies: [], connections: {}, invites: [] };

interface HomePageProps {
  /** The user's generated name, shown next to the avatar in the taskbar */
  userName?: string;
  /** Replaces the default avatar drawing in the taskbar */
  avatar?: ReactNode;
  /** Image URL for the user's own card inside lobbies (optional) */
  avatarUrl?: string;
  /** Optional content for the right side of the taskbar (step counter, clock, etc.) */
  taskbarRight?: ReactNode;
  /** Other users who can appear in lobbies and connections */
  people?: Person[];
  /** The user's free slots from the pre-survey calendar ("mon|09:30"), shown when hosting and used by lobby filters */
  myAvailability?: string[];
  /** The user's subjects (e.g. courses from the pre-survey), used by the lobby browser's "My subjects" filter */
  mySubjects?: string[];
  /** Places offered when hosting a session (public cafes, libraries…). Leave out for the defaults. */
  locationSuggestions?: string[];
  /** Lobbies and connection statuses to start with */
  initialStudyState?: StudyState;
  /** The backend's live copy of lobbies and connections. Each new copy replaces what's shown. */
  studyState?: StudyState;
  /** Loads the newest lobbies from the backend (the Study Lobbies window's Refresh button) */
  onRefreshStudy?: () => Promise<void>;
  /** Opens the Study Lobbies window right away, e.g. on arriving from the pre-survey */
  openLobbiesAtStart?: boolean;
  /**
   * Shows the welcome tour of Home (new accounts). openLobbiesAtStart then waits until it's done.
   * onDone runs when the tour finishes or is closed.
   */
  welcomeTour?: { onDone: () => void };
  /** Every lobby / connection action the user takes, e.g. to send to your backend */
  onStudyAction?: (action: StudyAction) => void;
  /** Starting values for the profile editor beyond the props above (animal, courses, contact…) */
  initialProfile?: Partial<MyProfile>;
  /**
   * Saves the edited profile, e.g. to your backend. Throw to show an error in the window.
   * Return the profile as saved if the backend changed anything (matched course names…).
   */
  onSaveProfile?: (profile: MyProfile) => void | MyProfile | Promise<void | MyProfile>;
  /** Muse draws a new avatar from the nickname (the profile window's "Draw a new avatar") */
  onRedrawAvatar?: () => Promise<void>;
  /** Nickname and avatar changes left today, shown in the profile window */
  identityChangesLeft?: number | null;
  /** The profile window's Account section */
  onLogOut?: () => void;
  onDeleteAccount?: () => Promise<void>;
}

export default function HomePage({
  userName = 'Generated Name',
  avatar,
  avatarUrl,
  taskbarRight,
  people = [],
  myAvailability,
  mySubjects,
  locationSuggestions,
  initialStudyState = EMPTY_STUDY_STATE,
  studyState,
  onRefreshStudy,
  openLobbiesAtStart = false,
  welcomeTour,
  onStudyAction,
  initialProfile,
  onSaveProfile,
  onRedrawAvatar,
  identityChangesLeft,
  onLogOut,
  onDeleteAccount,
}: HomePageProps) {
  // The welcome tour comes first; the lobbies open once it's done
  const [lobbiesOpen, setLobbiesOpen] = useState(openLobbiesAtStart && !welcomeTour);
  const [tourOpen, setTourOpen] = useState(!!welcomeTour);
  const finishTour = () => {
    setTourOpen(false);
    welcomeTour?.onDone();
    if (openLobbiesAtStart) setLobbiesOpen(true);
  };
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  // My Croft: your own, and the one you're visiting from someone's profile card
  const [croftOpen, setCroftOpen] = useState(false);
  const [visitingId, setVisitingId] = useState<string | null>(null);
  const visitCroft = useCallback((personId: string) => {
    if (personId === ME) setCroftOpen(true);
    else setVisitingId(personId);
  }, []);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  // Theme: 'default' (sun) or 'custom' (star). The star opens the prompt window.
  // The user's theme: loaded from Supabase, applied to the whole page, saved when it changes
  const theme = useUserTheme();
  const [themePromptOpen, setThemePromptOpen] = useState(false);
  // Every theme has its own piece: the default theme's meadow tune, or the custom theme's. A custom
  // theme without one yet plays the stand-in while Muse writes it (useUserTheme asks for it).
  const music = useThemeMusic(
    theme.choice === 'custom' ? (theme.savedTheme?.music ?? FALLBACK_MUSIC) : defaultMusicFor(defaultBackgroundName),
  );

  // The user's own profile. Saving it updates the nav bar, lobby filters and host form right away.
  const [profile, setProfile] = useState<MyProfile>(() => ({
    nickname: userName,
    animal: 'Penguin',
    seekingHelpWith: mySubjects ?? [],
    coursesTaken: [],
    courses: [],
    answers: {},
    availability: myAvailability ?? [],
    contact: { discord: '', instagram: '', phone: '' },
    ...initialProfile,
  }));
  const saveProfile = async (next: MyProfile) => {
    // If this throws, the window shows the error and keeps the draft
    const saved = (await onSaveProfile?.(next)) ?? next;
    setProfile(saved);
    return saved;
  };
  // A save that stopped partway (the nickname went through, then courses didn't) still changed
  // what's saved. The backend's copy comes back through initialProfile, so follow it: the nav bar
  // shows the new name, and Undo in the profile window doesn't go back past what was saved.
  // (Checked during render, React's way to adjust state when a prop changes; initialProfile is a
  // new object every render, so its contents are compared.)
  const savedKey = JSON.stringify(initialProfile ?? null);
  const [seenSavedKey, setSeenSavedKey] = useState(savedKey);
  if (savedKey !== seenSavedKey) {
    setSeenSavedKey(savedKey);
    if (initialProfile) setProfile((prev) => ({ ...prev, ...initialProfile }));
  }
  const [study, dispatch] = useStudyState(initialStudyState, onStudyAction, studyState);
  // The live activity feed at the bottom right: sessions that fit you, and visits and help on your croft
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const chat = useWorldChat(study.lobbies, peopleById);

  const pendingRequests = Object.values(study.connections).filter((s) => s === 'received').length;
  // People waiting to join the lobby you host
  const waitingToJoin = study.lobbies
    .filter((l) => l.hostId === ME)
    .reduce((sum, l) => sum + l.requestIds.length, 0);
  // Invites from connections waiting for an answer: a red dot on Sessions
  const invitesWaiting = pendingInvites(study).length;


  const taskbarApps: TaskbarApp[] = [
    {
      id: 'lobbies',
      name: 'Lobbies',
      label: lobbiesOpen ? 'Close study lobbies' : 'Open study lobbies',
      icon: <LobbiesIcon />,
      open: lobbiesOpen,
      onClick: () => setLobbiesOpen((o) => !o),
    },
    {
      id: 'sessions',
      name: 'Sessions',
      label:
        (sessionsOpen ? 'Close sessions' : 'Open sessions') +
        (waitingToJoin > 0 ? ` (${waitingToJoin} waiting to join)` : '') +
        (invitesWaiting > 0 ? ` (${invitesWaiting} new invite${invitesWaiting === 1 ? '' : 's'})` : ''),
      icon: <SessionsIcon />,
      open: sessionsOpen,
      alert: invitesWaiting > 0,
      onClick: () => setSessionsOpen((o) => !o),
    },
    {
      id: 'connections',
      name: 'Connections',
      label:
        (connectionsOpen ? 'Close connections' : 'Open connections') +
        (pendingRequests > 0 ? ` (${pendingRequests} new request${pendingRequests === 1 ? '' : 's'})` : ''),
      icon: <LinkIcon />,
      open: connectionsOpen,
      onClick: () => setConnectionsOpen((o) => !o),
    },
  ];

  // In the gear menu at the right of the bar, next to music and theme
  const gearApps: TaskbarApp[] = [
    {
      // Features on the way, in a drop-down; My Croft is the first
      id: 'upcoming',
      name: 'Upcoming',
      label: 'Upcoming features',
      icon: <UpcomingIcon />,
      menu: [
        {
          id: 'croft',
          name: 'Croft',
          label: croftOpen ? 'Close your croft' : 'Open your croft',
          open: croftOpen,
          onClick: () => setCroftOpen((o) => !o),
        },
      ],
    },
  ];

  // Recreated only when the name changes; the tour reads the newest copy
  const tourSteps = useMemo(() => welcomeTourSteps(profile.nickname), [profile.nickname]);

  return (
    // overflow-clip: a window dragged past the edge (or springing back) never adds page scrollbars
    <div className="doodle w-full h-dvh flex flex-col overflow-clip">
      <Taskbar
        userName={profile.nickname}
        profile={{ open: profileOpen, onClick: () => setProfileOpen((o) => !o) }}
        avatar={avatar}
        right={taskbarRight}
        apps={taskbarApps}
        gearApps={gearApps}
        music={{
          title: music.title,
          volume: music.volume,
          muted: music.muted,
          onVolume: music.setVolume,
          onToggleMute: music.toggleMute,
        }}
        theme={{
          // The star shows as selected while its prompt is open
          active: themePromptOpen ? 'custom' : theme.choice,
          onSelectDefault: () => {
            theme.switchToDefault();
            setThemePromptOpen(false);
          },
          onSelectCustom: () => setThemePromptOpen(true),
        }}
      />

      {tourOpen && <Tour steps={tourSteps} onClose={finishTour} />}

      {/* The picture is this container's own background, so only the area under the taskbar gets it
          and children keep their own backgrounds on top. */}
      <main
        className={`relative flex-1 min-h-0 flex flex-col px-2 pb-2 md:px-3 md:pb-3 ${TASKBAR_CLEARANCE}`}
        // Built only from checked theme values: the default picture, or the user's own generated one
        style={theme.backgroundStyle(defaultbg)}
      >
        {/* Out of the desk, so it stays in the screen's corner while the desk is shortened on phones */}
        <WorldChat lines={chat.lines} history={chat.history} unread={chat.unread} onOpen={chat.markRead} />
        {/* Desk area: windows rest inside this box. `relative` so window layers can cover it.
            It starts empty; windows open from the nav bar. On phones it stops short of the bottom,
            leaving a strip for the gear (bottom left) and the chat button (bottom right):
            16px corner gap + 40px button + 8px = 64px; main's pb-2 gives 8px, mb-14 the other 56px. */}
        <div className="relative flex-1 min-h-0 min-w-0 mb-14 sm:mb-0">
          {/* All windows on the desk share one stack and one tiling layout */}
          <WindowManagerProvider>
            {/* "Visit croft" on any profile card opens that person's croft */}
            <CroftVisitContext.Provider value={visitCroft}>
              <StudyLayout
                me={{ name: profile.nickname, avatar: avatarUrl }}
                people={people}
                myAvailability={profile.availability}
                // The "My subjects" lobby filter: courses you want help with, have taken, and are taking now
                mySubjects={[
                  ...profile.seekingHelpWith,
                  ...profile.coursesTaken,
                  ...profile.courses.filter((c) => c.status === 'taking').map((c) => c.name),
                ]}
                // Hosting offers only the courses they're taking right now
                currentCourses={profile.courses.filter((c) => c.status === 'taking' && c.name.trim()).map((c) => c.name)}
                locationSuggestions={locationSuggestions}
                state={study}
                dispatch={dispatch}
                lobbiesOpen={lobbiesOpen}
                onLobbiesClose={() => setLobbiesOpen(false)}
                connectionsOpen={connectionsOpen}
                onConnectionsClose={() => setConnectionsOpen(false)}
                sessionsOpen={sessionsOpen}
                onSessionsClose={() => setSessionsOpen(false)}
                onRefresh={onRefreshStudy}
              />

              {/* One layer per window: windows in a shared layer stack below each other, so the
                  visited croft landed under the desk, out of sight */}
              <WindowLayer>
                <CroftWindow id="croft" open={croftOpen} onClose={() => setCroftOpen(false)} ownerId={null} />
              </WindowLayer>
              <WindowLayer>
                <CroftWindow
                  id="croft-visit"
                  open={visitingId !== null}
                  onClose={() => setVisitingId(null)}
                  ownerId={visitingId}
                />
              </WindowLayer>
            </CroftVisitContext.Provider>
          </WindowManagerProvider>

          {/* Popup from the avatar and name in the nav bar */}
          <ProfileEditorWindow
            open={profileOpen}
            onClose={() => setProfileOpen(false)}
            profile={profile}
            onSave={saveProfile}
            avatarUrl={avatarUrl}
            changesLeft={identityChangesLeft}
            onRedrawAvatar={onRedrawAvatar}
            onLogOut={onLogOut}
            onDeleteAccount={onDeleteAccount}
            onUnblocked={() => void onRefreshStudy?.()}
          />

          {/* Popup from the star in the theme menu */}
          <ThemePromptWindow
            open={themePromptOpen}
            onClose={() => setThemePromptOpen(false)}
            onGenerate={async (prompt) => {
              await theme.generate(prompt);
            }}
            themes={theme.library}
            activeThemeId={theme.activeThemeId}
            onUseTheme={(id) => {
              theme.switchToLibraryTheme(id);
              setThemePromptOpen(false);
            }}
            onDeleteTheme={theme.deleteLibraryTheme}
            themesLeft={theme.themesLeft}
          />
        </div>
      </main>
    </div>
  );
}