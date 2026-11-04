# StudBuds web app

The React front end of StudBuds. What it is, how to try it and how to set up the database are in the
[main README](../README.md).

Needs Node 22.12 or newer (or 20.19+ on Node 20), which Vite 8 needs. It reads the public `VITE_`
keys from the `.env` at the repo root (`../.env`), so copy `.env.example` there first.

```sh
npm install
npm run dev       # local server at http://localhost:5173
npm run build     # type-checks, then builds to dist/
npm run preview   # serves the built dist/ to check it before deploying
npm run lint      # oxlint
```

## Where things are

- `src/App.tsx` sets up the three pages: `/login` (`AuthPage.tsx`), `/survey`
  (`PresurveyFlow.tsx`) and `/` (`HomePage.tsx`, the desktop with its windows).
- `src/components/` has every window and the pieces inside them: Study Lobbies, Host a session, the
  lobby view and chat, Sessions, Connections, the profile editor, the nav bar (`Taskbar.tsx`), the
  welcome tour and the activity feed. `croft/` is the farm.
- `src/lib/` talks to Supabase: one file per area (lobbies and connections in `study.ts`, the
  student's own profile in `profile.ts`, report, block and contact sharing in `safety.ts`) and
  `edgeFunctions.ts` for the Muse calls.
- `src/utils/` has the rest of the app's logic: lobby state and filters, live lobby chat, schedule
  reading (`.ics` files and screenshots), themes and the music player.
- `src/dataFiles/` holds the survey questions, academic options and croft data.
- `public/` has the tab icon, the home screen icon and the link preview image.
