import type { ReactNode } from 'react';
import AppWindow from './AppWindow';
import PersonAvatar from './PersonAvatar';
import { ConnectControl } from './PersonCard';
import type { ConnectionStatus, Person } from '../dataFiles/studyData';
import type { StudyDispatch } from '../utils/studyState';

interface ConnectionsWindowProps {
  id: string;
  open: boolean;
  onClose: () => void;
  people: Person[];
  connections: Record<string, ConnectionStatus>;
  dispatch: StudyDispatch;
}

function Group({ title, people, empty, connections, dispatch }: {
  title: ReactNode;
  people: Person[];
  empty: string;
  connections: Record<string, ConnectionStatus>;
  dispatch: StudyDispatch;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="m-0 text-base opacity-80">{title}</h3>
      {people.length === 0 ? (
        <p className="m-0 text-sm opacity-60">{empty}</p>
      ) : (
        <ul className="m-0 p-0 list-none flex flex-col gap-2">
          {people.map((p) => (
            <li key={p.id} className="list-none flex items-center gap-3 p-2 rounded-md border-2 border-[#3c3c3c]/25 bg-[#FDF7F1]">
              <PersonAvatar person={p} className="w-9 h-9" />
              <span className="flex-1 min-w-0 truncate">{p.name}</span>
              <ConnectControl person={p} status={connections[p.id] ?? 'none'} dispatch={dispatch} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Friend-request style connections: requests to answer, people you're connected with, requests you sent */
export default function ConnectionsWindow({ id, open, onClose, people, connections, dispatch }: ConnectionsWindowProps) {
  const withStatus = (status: ConnectionStatus) => people.filter((p) => connections[p.id] === status);
  const received = withStatus('received');

  return (
    <AppWindow
      id={id}
      title="Connections"
      open={open}
      onClose={onClose}
      controls={{ close: 'enabled', fullscreen: 'enabled' }}
      initialSize={{ width: 380, height: 500 }}
      initialAlign="center"
      minWidth={300}
      minHeight={260}
      bodyClassName="p-3 flex flex-col gap-5"
    >
      <p className="m-0 text-sm opacity-80">
        Connect with people from lobbies using the Connect button on their card.
      </p>
      <Group
        title={`Requests${received.length > 0 ? ` (${received.length})` : ''}`}
        people={received}
        empty="No requests right now."
        connections={connections}
        dispatch={dispatch}
      />
      <Group title="Connected" people={withStatus('connected')} empty="No connections yet." connections={connections} dispatch={dispatch} />
      <Group title="Sent" people={withStatus('sent')} empty="No pending requests." connections={connections} dispatch={dispatch} />
    </AppWindow>
  );
}