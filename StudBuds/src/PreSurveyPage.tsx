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
    <div className="doodle w-full h-dvh p-4">
      <main className="doodle-border w-full h-full flex flex-col md:flex-row gap-6 p-6 min-h-0">
        {/* LEFT: big icon + generated name */}
        <aside className="shrink-0 flex flex-col items-center gap-3 md:w-64">
          <svg
            className="w-32 h-32 md:w-56 md:h-56"
            viewBox="0 0 48 48"
            role="img"
            aria-label={`${userName}'s avatar`}
          >
            <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="3" />
            <ellipse cx="24" cy="20" rx="5" ry="4" fill="currentColor" />
            <path d="M8 38 Q24 14 40 38 Z" fill="currentColor" />
          </svg>
          <p className="text-xl underline text-center break-words max-w-full">{userName}</p>
        </aside>

        {/* FIRST INNER FRAME */}
        <section className="doodle-border flex-1 min-w-0 min-h-0 flex flex-col gap-4 p-6">
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
