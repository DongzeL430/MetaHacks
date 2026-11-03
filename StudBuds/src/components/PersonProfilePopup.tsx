import { useId } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import PersonCard from './PersonCard';
import type { ConnectionStatus, Person } from '../dataFiles/StudyData';
import type { StudyDispatch } from '../utils/StudyState';

interface PersonProfilePopupProps {
  /** Whose profile to show. null = closed. */
  person: Person | null;
  status: ConnectionStatus;
  dispatch: StudyDispatch;
  onClose: () => void;
}

/**
 * Another student's profile, in a popup that dims the page: the same details as their lobby card
 * (what they need help with, when you're both free, courses taken) and the connect button.
 * Closes with its X, Escape, or a click on the dimmed area.
 * Render it in the desk area (which needs `relative`), not inside a WindowLayer.
 */
export default function PersonProfilePopup({ person, status, dispatch, onClose }: PersonProfilePopupProps) {
  const titleId = useId();
  if (!person) return null;

  return (
    <>
      <div
        aria-hidden="true"
        onPointerDown={onClose}
        className="fixed inset-0 z-[45] bg-ink/25 motion-safe:transition-opacity motion-safe:duration-200 starting:opacity-0"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="absolute inset-0 z-50 p-3"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <AppWindow
          title={person.name}
          titleId={titleId}
          accent={WINDOW_ACCENTS.lilac}
          info="What this student shares with classmates: courses they’d like help with, when you’re both free, and courses they’ve taken. Grades and ratings are never shown."
          onClose={onClose}
          excludeFromLayout
          controls={{ close: 'enabled', fullscreen: 'hidden', pin: 'hidden' }}
          initialSize={({ width, height }) => ({
            width: Math.min(width * 0.9, 460),
            height: Math.min(height * 0.85, 560),
          })}
          minWidth={280}
          minHeight={260}
          bodyClassName="p-3 flex flex-col gap-3"
        >
          <PersonCard person={person} status={status} dispatch={dispatch} />
        </AppWindow>
      </div>
    </>
  );
}
