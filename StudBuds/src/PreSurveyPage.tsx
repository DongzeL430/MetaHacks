import type { FormEvent, ReactNode } from 'react';
import AppWindow from './components/Appwindow';
import Taskbar, { TASKBAR_CLEARANCE } from './components/TaskBar';

interface PreSurveyPageProps {
  /** The user's generated name, shown next to the avatar in the taskbar */
  userName?: string;
  /** Replaces the default avatar drawing in the taskbar */
  avatar?: ReactNode;
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
}

export default function PreSurveyPage({
  userName = 'Generated Name',
  avatar,
  sectionTitle = 'Survey Section Name',
  sectionBio,
  windowTitle = 'Your answers',
  children,
  footer,
  taskbarRight,
  onSubmit,
}: PreSurveyPageProps) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit?.(new FormData(e.currentTarget));
  };

  return (
    <div className="doodle w-full h-dvh flex flex-col">
      <Taskbar userName={userName} avatar={avatar} right={taskbarRight} />

      <main className={`flex-1 min-h-0 flex flex-col px-4 pb-4 md:px-8 md:pb-8 ${TASKBAR_CLEARANCE}`}>
        <section className="flex-1 min-w-0 min-h-0 flex flex-col gap-4">
          <h1 className="text-3xl leading-snug">{sectionTitle}</h1>
          {sectionBio && <p className="opacity-80">{sectionBio}</p>}

          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col" noValidate>
            {/* Desk area: the window moves and resizes inside this box and can't leave it */}
            <div className="flex-1 min-h-0 min-w-0">
              <AppWindow title={windowTitle} footer={footer}>
                {children ?? (
                  <p className="m-auto text-center opacity-60">
                    Reserved for input forms and custom components
                  </p>
                )}
              </AppWindow>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}