import { useEffect, useRef, useState } from 'react';
import AppWindow, { WINDOW_ACCENTS } from './AppWindow';
import { LIST_WINDOW_SIZE } from './SessionsWindow';
import PersonAvatar from './PersonAvatar';
import { ME } from '../dataFiles/StudyData';
import type { Lobby, Person } from '../dataFiles/StudyData';
import { CHAT_LIMITS, useLobbyChat } from '../utils/LobbyChat';

interface ChatWindowProps {
  id: string;
  /** The lobby being chatted in. null = window closed. */
  lobby: Lobby | null;
  /** Names and avatars by user id. Anyone missing shows as "Someone". */
  people: Map<string, Person>;
  onClose: () => void;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * Live group chat for one lobby, through Supabase Realtime.
 * Messages from the same person in a row are grouped under one name.
 * Your messages sit on the right in orange; everyone else's on the left.
 */
export default function ChatWindow({ id, lobby, people, onClose }: ChatWindowProps) {
  const chat = useLobbyChat(lobby?.id ?? null);
  const [draft, setDraft] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [chat.messages.length, lobby?.id]);

  // Fresh box, focused, whenever a different lobby's chat opens
  useEffect(() => {
    if (!lobby) return;
    setDraft('');
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [lobby?.id]);

  const canSend =
    !!draft.trim() && chat.cooldownSeconds === 0 && chat.status !== 'loading' && chat.status !== 'error';

  const send = async () => {
    const text = draft.trim();
    if (!canSend) return;
    setDraft(''); // clear right away; put it back if it couldn't be sent
    const sent = await chat.send(text);
    if (!sent) setDraft((current) => current || text);
  };

  const statusLine =
    chat.status === 'loading'
      ? 'Loading messages…'
      : chat.status === 'reconnecting'
        ? 'Reconnecting… new messages will show up when the connection is back.'
        : chat.status === 'error'
          ? chat.loadError
          : '';

  return (
    <AppWindow
      id={id}
      title={lobby ? `Chat: ${lobby.subject}` : 'Chat'}
      accent={WINDOW_ACCENTS.butter}
      info="Group chat for this lobby. Only people in the lobby can read and send messages here, and new messages show up for everyone instantly."
      open={!!lobby}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'enabled' }}
      initialSize={LIST_WINDOW_SIZE}
      minWidth={280}
      minHeight={260}
      bodyClassName="p-3 flex flex-col gap-2"
      footer={
        <div className="flex flex-col gap-1">
          {chat.sendError && (
            <p role="alert" className="m-0 text-sm text-danger">
              {chat.sendError}
            </p>
          )}
          <div className="flex items-center gap-2">
            <label className="flex-1 min-w-0">
              <span className="sr-only">Message</span>
              <input
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault(); // send instead of submitting the page
                    void send();
                  }
                }}
                placeholder="Type a message"
                maxLength={CHAT_LIMITS.maxLength}
                autoComplete="off"
                className="w-full px-2 py-1"
              />
            </label>
            <button type="button" onClick={() => void send()} disabled={!canSend} className="px-3 py-0.5 text-sm">
              {chat.cooldownSeconds > 0 ? `Wait ${chat.cooldownSeconds}s` : 'Send'}
            </button>
          </div>
        </div>
      }
    >
      {statusLine && (
        <p role="status" className={`m-0 text-sm ${chat.status === 'error' ? 'text-danger' : 'opacity-70'}`}>
          {statusLine}
        </p>
      )}

      {chat.status !== 'loading' && chat.status !== 'error' && chat.messages.length === 0 ? (
        <p className="m-auto text-center text-sm opacity-70">No messages yet. Say hi to your group!</p>
      ) : (
        <ol aria-label="Messages" aria-live="polite" className="m-0 p-0 list-none flex flex-col gap-1.5">
          {chat.messages.map((m, i) => {
            const mine = m.sender_id === chat.myId;
            // Your own profile is kept under ME, not your user id, so look yourself up there
            const author = (mine ? people.get(ME) : people.get(m.sender_id)) ?? {
              id: m.sender_id,
              name: mine ? 'You' : 'Someone',
            };
            const startsGroup = i === 0 || chat.messages[i - 1].sender_id !== m.sender_id;
            return (
              <li
                key={m.id}
                className={`list-none flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${startsGroup ? 'mt-2' : ''}`}
              >
                {/* Avatar only on the first message of a run, a same-size spacer otherwise */}
                {startsGroup ? (
                  <PersonAvatar person={author} className="w-7 h-7" />
                ) : (
                  <span aria-hidden="true" className="w-7 shrink-0" />
                )}
                <div className={`max-w-[75%] flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {startsGroup && (
                    <span className="text-xs opacity-70">
                      {mine ? 'You' : author.name} · {timeOf(m.created_at)}
                    </span>
                  )}
                  <p
                    className={`m-0 px-3 py-1.5 rounded-xl border-2 border-ink/25 text-sm whitespace-pre-wrap break-words ${
                      mine ? 'bg-accent/35 rounded-br-sm' : 'bg-paper rounded-bl-sm'
                    } ${m.pending ? 'opacity-60' : ''}`}
                  >
                    {m.body}
                  </p>
                  {m.pending && <span className="text-[11px] opacity-60">Sending…</span>}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <div ref={endRef} />
    </AppWindow>
  );
}