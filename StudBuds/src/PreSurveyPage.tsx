import type { FormEvent, ReactNode } from 'react';

interface PreSurveyPageProps {
  /** The user's generated name, shown under the icon */
  userName?: string;
  sectionTitle?: string;
  /** Short note on what this info is used for (optional) */
  sectionBio?: string;
  /** Inputs / custom components rendered inside the inner frame */
  children?: ReactNode;
  submitLabel?: string;
  /** Receives every named field inside the inner frame */
  onSubmit?: (data: FormData) => void;
}

export default function PreSurveyPage({
  userName = 'Generated Name',
  sectionTitle = 'Survey Section Name',
  sectionBio,
  children,
  submitLabel = 'Submit',
  onSubmit,
}: PreSurveyPageProps) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit?.(new FormData(e.currentTarget));
  };

  return (
    <div className="doodle w-full h-dvh ">
      {/* Outer padding leaves room for the icon to hang over the frame's corner */}
      <main className="w-full h-full flex flex-col p-6 md:p-12 min-h-0">
        {/* FIRST INNER FRAME. pt/pl clear space for the icon + name block on the left */}
        <section className="relative doodle-border flex-1 min-w-0 min-h-0 flex flex-col gap-4 p-6 pt-36 md:pt-6 md:pl-48">
          {/* Icon + generated name, pinned to the frame's top-left and hanging over the corner */}
          <div className="absolute -top-6 -left-6 md:-top-10 md:-left-10 w-28 md:w-48 flex flex-col">
            <svg
              className="w-full h-auto"
              viewBox="0 0 48 48"
              role="img"
              aria-label={`${userName}'s avatar`}
            >
              {/* Filled with the doodle background color so it cuts off the frame's corner */}
              <circle cx="24" cy="24" r="21" fill="#FDF7F1" stroke="currentColor" strokeWidth="3" />
              <ellipse cx="24" cy="20" rx="5" ry="4" fill="currentColor" />
              <path d="M8 38 Q24 14 40 38 Z" fill="currentColor" />
            </svg>
            <p className="pl-6 md:pl-10 pr-2 pt-2 text-lg md:text-xl underline text-center break-words">
              {userName}
            </p>
          </div>

          <h1 className="text-3xl leading-snug">{sectionTitle}</h1>
          {sectionBio && <p className="opacity-80">{sectionBio}</p>}

          <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col gap-4" noValidate>
            {/* SECOND INNER FRAME: reserved for inputs / custom React components.
                Scrolls when the content is taller than the space available. */}
            <div className="doodle-border flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
              {children ?? (
                <p className="m-auto text-center opacity-60">
                  Reserved for input forms and custom components
                </p>
              )}
            </div>

            <button type="submit" className="self-stretch py-2">
              {submitLabel}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
