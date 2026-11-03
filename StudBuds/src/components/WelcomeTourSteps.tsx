import type { TourStep } from './Tour';

/**
 * Home's welcome tour, shown once to a new account right after the pre-survey. Each `target` is a
 * `data-tour` name in the nav bar or a window. Steps with `advanceWhen` wait for the student to
 * click (open the lobbies, open Host a session, create their lobby, open Sessions and Connections,
 * open the gear and its theme menu); `ifMissing` steps back if they
 * close that window partway through.
 */
export function welcomeTourSteps(nickname: string): TourStep[] {
  return [
    {
      title: `Welcome to StudBuds, ${nickname}!`,
      body: (
        <>
          <p className="m-0">Your survey is in, and you’re ready to find study partners.</p>
          <p className="m-0">Let’s take a quick look around before you jump in.</p>
        </>
      ),
    },
    {
      target: 'profile',
      title: 'Your profile',
      body: (
        <>
          <p className="m-0">This is you. This button opens your profile.</p>
          <p className="m-0">
            Your survey answers live there: your free times, your courses and how you like to study. You can change
            your answers and preferences any time, and your matches update to fit.
          </p>
        </>
      ),
    },

    // STUDY LOBBIES
    {
      id: 'lobbies-app',
      target: 'app-lobbies',
      advanceWhen: 'lobby-list',
      title: 'Study Lobbies',
      body: (
        <>
          <p className="m-0">
            Lobbies are study sessions hosted by other students. Each one has a subject, a time, a place and a few open
            spots.
          </p>
          <p className="m-0 font-bold">Click Lobbies to open them.</p>
        </>
      ),
    },
    {
      target: 'lobby-list',
      ifMissing: 'lobbies-app',
      placement: 'right',
      title: 'Lobbies that fit you',
      body: (
        <p className="m-0">
          This is where all the available study lobbies that fit your criteria appear, best match first. Click one to
          see who’s in it and ask to join.
        </p>
      ),
    },
    {
      target: 'lobby-search',
      ifMissing: 'lobbies-app',
      title: 'Search and filters',
      body: (
        <p className="m-0">
          The lobbies out there won’t always fit our default criteria, so you can pick and choose what you’re looking
          for! Search by subject, or open Filters to match on free time, subjects and group size, or to see
          sessions at other schools too.
        </p>
      ),
    },
    {
      id: 'host-button',
      target: 'host-button',
      ifMissing: 'lobbies-app',
      advanceWhen: 'host-window',
      title: 'Host a session',
      body: (
        <>
          <p className="m-0">Can’t find the course or lobby you want? Make your own!</p>
          <p className="m-0 font-bold">Click + Host a session to try it.</p>
        </>
      ),
    },

    // HOST A SESSION WINDOW
    {
      target: 'host-subject',
      ifMissing: 'host-button',
      title: 'What you’re studying',
      body: (
        <p className="m-0">
          Start with the subject or course. Your own courses are suggested, or type anything. It’s how other students
          find your lobby.
        </p>
      ),
    },
    {
      target: 'host-place',
      ifMissing: 'host-button',
      title: 'Where you’ll meet',
      body: (
        <p className="m-0">
          Pick a cafe or library near your school from the list, or type any place, like a room number.
        </p>
      ),
    },
    {
      target: 'host-size',
      ifMissing: 'host-button',
      title: 'Group size',
      body: (
        <p className="m-0">
          How many people can join, you included. Others ask to join, and you choose who gets in.
        </p>
      ),
    },
    {
      target: 'host-time',
      ifMissing: 'host-button',
      placement: 'top',
      title: 'When it meets',
      body: (
        <p className="m-0">
          Drag down a day on your schedule to pick the session’s time. Your free times from the survey show
          underneath, and you’ll get a heads up if you pick time you marked busy.
        </p>
      ),
    },
    {
      target: 'host-window',
      ifMissing: 'host-button',
      advanceWhen: 'lobby-lock',
      passThrough: true,
      placement: 'right',
      title: 'Your turn',
      body: (
        <>
          <p className="m-0">Fill in your session, then click Create lobby.</p>
          <p className="m-0 text-sm opacity-80">
            Not ready to host yet? You can close your lobby at the end of the tour.
          </p>
        </>
      ),
    },

    // YOUR LOBBY
    {
      target: 'lobby-tabs',
      title: 'The lobby browser',
      body: (
        <>
          <p className="m-0">You’re hosting! This is the lobby browser.</p>
          <p className="m-0">
            Each tab is a different session you’re viewing, like tabs in a web browser. Open more from Study Lobbies or
            Sessions, and close them with their ✕.
          </p>
        </>
      ),
    },
    {
      target: 'lobby-details',
      title: 'Lobby details',
      body: (
        <p className="m-0">
          All of your lobby’s details are at the top of its tab: the subject, who hosts it, when and where it meets, and
          how many spots are filled.
        </p>
      ),
    },
    {
      target: 'lobby-chat',
      title: 'Chat',
      body: (
        <p className="m-0">
          Talk with everyone in your lobby: say hi, plan what to cover, or let people know you’re running late. Only
          people in the lobby can see it.
        </p>
      ),
    },
    {
      target: 'lobby-invite',
      title: 'Invite',
      body: (
        <p className="m-0">
          Invite your connections to this session. They’ll get it under Sessions › Invites. When you’re the host, they
          join as soon as they accept.
        </p>
      ),
    },
    {
      target: 'lobby-requests',
      placement: 'top',
      title: 'Join requests',
      body: (
        <p className="m-0">
          Students who want to join show up here. Accept to give them a spot, or Decline. Accepted students appear
          under “In this lobby”.
        </p>
      ),
    },
    {
      target: 'lobby-lock',
      title: 'Lock session',
      body: (
        <p className="m-0">
          Have the group you want? Lock the session to stop new join requests. Anyone already waiting can still be
          answered, and you can unlock it any time.
        </p>
      ),
    },
    {
      target: 'lobby-close',
      title: 'Close lobby',
      body: (
        <>
          <p className="m-0">
            When the session is over (or plans change), close the lobby. It ends it for everyone and takes it off the
            list.
          </p>
        </>
      ),
    },

    // SESSIONS
    {
      id: 'sessions-app',
      target: 'app-sessions',
      advanceWhen: 'sessions-window',
      title: 'Sessions',
      body: (
        <>
          <p className="m-0">Sessions keeps every lobby you’re part of in one place, so you never lose track of one.</p>
          <p className="m-0 font-bold">Click Sessions to open it.</p>
        </>
      ),
    },
    {
      target: 'sessions-window',
      ifMissing: 'sessions-app',
      placement: 'right',
      title: 'Your sessions',
      body: (
        <>
          <p className="m-0">
            Hosting, Joined and Requested list the sessions you host, the ones you’re in, and the ones waiting on a
            host to let you in. Click one to open its tab.
          </p>
          <p className="m-0">
            When a connection invites you to a session, it shows up under Invites, and a red dot appears on Sessions.
          </p>
        </>
      ),
    },

    // CONNECTIONS
    {
      id: 'connections-app',
      target: 'app-connections',
      advanceWhen: 'connections-window',
      title: 'Connections',
      body: (
        <>
          <p className="m-0">
            Met someone you’d like to study with again? Connect with them from their card in a lobby.
          </p>
          <p className="m-0 font-bold">Click Connections to open it.</p>
        </>
      ),
    },
    {
      target: 'connections-window',
      ifMissing: 'connections-app',
      placement: 'right',
      title: 'Your study buddies',
      body: (
        <p className="m-0">
          Like a friends list. Answer requests under Requests, see who you’re connected with under Connected, and
          keep track of the ones you’ve sent under Sent. Click someone to see their profile. Connections can invite
          each other to sessions.
        </p>
      ),
    },

    // SETTINGS AND THEMES
    {
      id: 'settings',
      target: 'settings',
      advanceWhen: 'theme-button',
      title: 'Settings',
      body: (
        <>
          <p className="m-0">
            The gear holds the extras: upcoming features to try, the music player (mute it or change the volume),
            and themes.
          </p>
          <p className="m-0 font-bold">Click the gear to open it.</p>
        </>
      ),
    },
    {
      target: 'theme-button',
      ifMissing: 'settings',
      advanceWhen: 'theme-panel',
      placement: 'left',
      title: 'Themes',
      body: (
        <>
          <p className="m-0">The paintbrush changes how StudBuds looks and sounds.</p>
          <p className="m-0 font-bold">Click the paintbrush.</p>
        </>
      ),
    },
    {
      // No ifMissing: picking a theme closes the menu, and this step just stays up in the middle
      target: 'theme-panel',
      placement: 'left',
      title: 'Make it yours',
      body: (
        <>
          <p className="m-0">
            The sun is the default look. The star makes a custom theme: describe a look, and StudBuds makes colors, a
            background picture and a short tune from it. Themes only change the look and music, never how the app
            works.
          </p>
          <p className="m-0">That’s the tour. Happy studying!</p>
        </>
      ),
    },
  ];
}
