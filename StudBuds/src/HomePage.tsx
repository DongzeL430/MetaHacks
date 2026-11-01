import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import AppWindow, { WindowManagerProvider } from './components/AppWindow';
import Taskbar, { TASKBAR_CLEARANCE } from './components/TaskBar.tsx';
import type { TaskbarApp } from './components/TaskBar';
import StudyLayout from './components/StudyLayout';
import type { Person } from './dataFiles/StudyData';
import { useStudyState } from './utils/StudyState';
import type { StudyAction, StudyState } from './utils/StudyState';
// Same background picture as the auth page.
import defaultbg from './assets/defaultbg.png';

// Which part of the picture stays in view when it has to be cropped (CSS background-position).
// 'center bottom' keeps the ground visible and trims the sky or sides first.
const BG_FOCUS = 'center bottom';

/* Taskbar icons (drawn at 24x24, sized by the taskbar) */
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

const EMPTY_STUDY_STATE: StudyState = { lobbies: [], connections: {} };

interface HomePageProps {
  /** The user's generated name, shown next to the avatar in the taskbar */
  userName?: string;
  /** Replaces the default avatar drawing in the taskbar */
  avatar?: ReactNode;
  /** Image URL for the user's own card inside lobbies (optional) */
  avatarUrl?: string;
  sectionTitle?: string;
  /** Short note on what this info is used for (optional) */
  sectionBio?: string;
  /** Text shown in the input window's title bar */
  windowTitle?: string;
  /** Inputs / custom components rendered inside the input window */
  children?: ReactNode;
  /** Pinned to the bottom of the window (Back / Submit buttons, progress dots) */
  footer?: ReactNode;
  /** Optional content for the right side of the taskbar (step counter, clock, etc.) */
  taskbarRight?: ReactNode;
  /** Receives every named field inside the input window */
  onSubmit?: (data: FormData) => void;
  /** Other users who can appear in lobbies and connections */
  people?: Person[];
  /** Lobbies and connection statuses to start with */
  initialStudyState?: StudyState;
  /** Every lobby / connection action the user takes, e.g. to send to your backend */
  onStudyAction?: (action: StudyAction) => void;
}

export default function HomePage({
  userName = 'Generated Name',
  avatar,
  avatarUrl,
  sectionTitle = 'Survey Section Name',
  sectionBio,
  windowTitle = 'Your answers',
  children,
  footer,
  taskbarRight,
  onSubmit,
  people = [],
  initialStudyState = EMPTY_STUDY_STATE,
  onStudyAction,
}: HomePageProps) {
  const [lobbiesOpen, setLobbiesOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [study, dispatch] = useStudyState(initialStudyState, onStudyAction);

  const pendingRequests = Object.values(study.connections).filter((s) => s === 'received').length;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit?.(new FormData(e.currentTarget));
  };

  const taskbarApps: TaskbarApp[] = [
    {
      id: 'lobbies',
      label: lobbiesOpen ? 'Close study lobbies' : 'Open study lobbies',
      icon: <LobbiesIcon />,
      open: lobbiesOpen,
      onClick: () => setLobbiesOpen((o) => !o),
    },
    {
      id: 'connections',
      label:
        (connectionsOpen ? 'Close connections' : 'Open connections') +
        (pendingRequests > 0 ? ` (${pendingRequests} new request${pendingRequests === 1 ? '' : 's'})` : ''),
      icon: <LinkIcon />,
      open: connectionsOpen,
      onClick: () => setConnectionsOpen((o) => !o),
    },
  ];

  return (
    // overflow-clip: a window dragged past the edge (or springing back) never adds page scrollbars
    <div className="doodle w-full h-dvh flex flex-col overflow-clip">
      <Taskbar userName={userName} avatar={avatar} right={taskbarRight} apps={taskbarApps} />

      {/* The picture is this container's own background, so only the area under the taskbar gets it
          and children keep their own backgrounds on top. */}
      <main
        className={`flex-1 min-h-0 flex flex-col px-4 pb-4 md:px-8 md:pb-8 bg-cover bg-no-repeat ${TASKBAR_CLEARANCE}`}
        style={{ backgroundImage: `url(${defaultbg})`, backgroundPosition: BG_FOCUS }}
      >
        <section className="flex-1 min-w-0 min-h-0 flex flex-col gap-4">
          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col" noValidate>
            {/* Desk area: windows rest inside this box. `relative` so window layers can cover it. */}
            <div className="relative flex-1 min-h-0 min-w-0">
              {/* All windows on the desk share one stack: the newest is in front, the ones behind shrink a little */}
              <WindowManagerProvider>

                <StudyLayout
                  me={{ name: userName, avatar: avatarUrl }}
                  people={people}
                  state={study}
                  dispatch={dispatch}
                  lobbiesOpen={lobbiesOpen}
                  onLobbiesClose={() => setLobbiesOpen(false)}
                  connectionsOpen={connectionsOpen}
                  onConnectionsClose={() => setConnectionsOpen(false)}
                />
              </WindowManagerProvider>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}