import { useEffect, useId, useRef, useState } from 'react';
import AppWindow from './AppWindow';
import { MAX_GROUP_SIZE, MIN_GROUP_SIZE, SUBJECT_SUGGESTIONS } from '../dataFiles/StudyData';

interface HostSessionWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  /** Called with the chosen subject and total group size (host included) */
  onCreate: (subject: string, maxSize: number) => void;
}

const SIZES = Array.from({ length: MAX_GROUP_SIZE - MIN_GROUP_SIZE + 1 }, (_, i) => MIN_GROUP_SIZE + i);

const CHIP = [
  'inline-flex items-center justify-center w-11 py-1 rounded-md border-2 border-[#3c3c3c]/45',
  'cursor-pointer select-none transition-colors hover:bg-[#EADBC8]/60',
  'has-checked:bg-[#F2A65A] has-checked:border-[#3c3c3c]',
  'has-focus-visible:outline-2 has-focus-visible:outline-dashed has-focus-visible:outline-offset-2',
].join(' ');

/** Form for hosting a new study lobby: a subject and a group size */
export default function HostSessionWindow({ id, open, onClose, onCreate }: HostSessionWindowProps) {
  const fieldId = useId();
  const subjectRef = useRef<HTMLInputElement>(null);
  const [subject, setSubject] = useState('');
  const [size, setSize] = useState(3);

  // Fresh form each time it opens
  useEffect(() => {
    if (!open) return;
    setSubject('');
    setSize(3);
    requestAnimationFrame(() => subjectRef.current?.focus());
  }, [open]);

  const trimmed = subject.trim();
  const canCreate = trimmed.length >= 2;
  const create = () => canCreate && onCreate(trimmed, size);

  return (
    <AppWindow
      id={id}
      title="Host a session"
      open={open}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'hidden' }}
      initialSize={{ width: 420, height: 400 }}
      minWidth={300}
      minHeight={300}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-3 py-0.5 text-sm">
            Cancel
          </button>
          <button type="button" onClick={create} disabled={!canCreate} className="px-3 py-0.5 text-sm">
            Create lobby
          </button>
        </div>
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-sm">What are you studying?</span>
        <input
          ref={subjectRef}
          type="text"
          list={`${fieldId}-subjects`}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault(); // don't submit the page; create instead
              create();
            }
          }}
          placeholder="e.g. Linear Algebra"
          autoComplete="off"
          maxLength={60}
          className="w-full px-2 py-1"
        />
        <datalist id={`${fieldId}-subjects`}>
          {SUBJECT_SUGGESTIONS.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </label>

      <div>
        <p id={`${fieldId}-size`} className="m-0 mb-1 text-sm">
          Group size
        </p>
        <div role="radiogroup" aria-labelledby={`${fieldId}-size`} className="flex gap-2">
          {SIZES.map((n) => (
            <label key={n} className={CHIP}>
              <input
                type="radio"
                name={`${fieldId}-size`}
                value={n}
                checked={size === n}
                onChange={() => setSize(n)}
                className="sr-only"
              />
              {n}
            </label>
          ))}
        </div>
        <p className="m-0 mt-2 text-sm opacity-70">
          You plus up to {size - 1} {size - 1 === 1 ? 'other person' : 'others'}. People request to join, and you choose who gets in.
        </p>
      </div>
    </AppWindow>
  );
}