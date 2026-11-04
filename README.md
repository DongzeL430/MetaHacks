<p align="center"><img src="StudBuds/public/logo.png" alt="The StudBuds bear, reading on a green blanket" width="160"></p>

# StudBuds

Finding someone to study with in college is weirdly hard. Group chats are noisy, asking a stranger
after class is awkward, and most "study buddy" apps want your name, photo and major before they show
you anyone. StudBuds goes the other way. You're a nickname and a drawing, and the app puts the
sessions most likely to suit you at the top.

**Live site:** _(Netlify link goes here)_

We built StudBuds for the Meta Global AI Developer Hackathon. Everything in this repo was made during
the hackathon.

## What it does

You sign up with your school `.edu` email. StudBuds gives you a random nickname (something like
"Merry Ladybug") and Muse draws you an avatar to go with it. Nobody sees your real name.

A short survey sets you up. You mark your free time on a calendar, or drop in a screenshot of your
class schedule and let Muse read it. You add the courses you've taken or are taking, each with how
confident you feel (1 means lost, 5 means you could teach it), and Muse can look up your major's
courses in your school's catalog to fill the list faster. Then a few questions about how you like to
study, and eight quick "this or that" picks, like early bird or night owl.

After that you land on Home, which works like a small desktop:

- **Study Lobbies** lists sessions other students are hosting, best fit first. Each one says why it's
  there: "Covers a course you want help with", "Similar study habits", "You agreed on 6 of 8 quick
  picks". It starts with your own school. Turn off "Only my school" in Filters to see sessions at
  other schools too.
- **Host a session** picks a subject, a time and a place. The places are real study spots at your
  school that Muse found on your school's own website.
- Inside a lobby you can ask to join, chat live with the group, invite your connections, and connect
  with people you'd like to study with again. Hosts accept requests, lock the session or remove
  someone.
- **Connections** is your friends list. When you're ready to keep in touch outside StudBuds, turn on
  "Share my contact" for one person and they'll see the Discord, Instagram or phone you added in
  your profile. Nobody else does.
- **Themes** turn a sentence ("rainy afternoon in a Scottish library") into a whole look: Muse
  writes the color palette, Muse Image paints the background, and Muse composes a short music box tune
  for it, which loops quietly while you study (mute and volume are in the nav bar).
- **Croft**, under "Upcoming", is a tiny Celtic farm of your own. You plant and harvest, visit
  classmates' crofts from their profile cards or the village list, and water one crop a day for
  them. It's there to make the site feel like a place with people in it.
- The **activity feed** at the bottom right pops up quiet messages as things happen: a new session
  that fits you, someone visiting or watering your croft.

## Try it

1. Open the site and sign up with your `.edu` email. You'll get an 8-digit code by email (no links,
   so school mail scanners can't use it up).
2. Go through the survey. Try the schedule screenshot on the calendar page and "Auto-fill courses" on
   the courses page if you want to see Muse at work.
3. On Home, the welcome tour shows you around. Open Study Lobbies and host a session.
4. To see the live parts (join requests, chat, connections, croft visits), sign up a second account
   in another browser or a private window, and join the first account's session. If the two
   accounts are at different schools, turn off "Only my school" in the lobby Filters first.
5. Make a theme from the paintbrush in the nav bar, then open Upcoming and Croft.

For testing, Vanderbilt and RIT count as one school in the "Only my school" filter, so a teammate at
each could try it together.

## Where Muse does the work

StudBuds runs on Meta's models through the Meta Model API. Every call happens in a Supabase Edge
Function, never in the browser, and each one is counted against a per-student limit and a shared
daily budget before it's made.

| Feature | Model | What it does |
| --- | --- | --- |
| Schedule screenshot | Muse Spark 1.3 (vision) | Reads a class schedule image into free and busy times, plus course codes |
| Auto-fill courses | Muse Spark 1.3 + web search | Searches your school's catalog for the courses your major has most likely covered by now |
| Course names | Muse Spark 1.3 (+ web search) | Matches what you typed ("orgo 1") to your school's real course codes |
| Nickname and avatar | Muse Spark 1.3, Muse Image | Checks a new nickname, then draws an avatar of it in one consistent hand-drawn style, and checks the picture |
| Study spots | Muse Spark 1.3 + web search | Finds real places to study on your school's own website, once per school |
| Session subjects | Muse Spark 1.3 | Links a free-form subject ("orgo midterm cram") to the course it's about, so it reaches the right people |
| Themes | Muse Spark 1.3, Muse Image | Writes a readable color palette, paints and checks a background, composes a tune |

The game art for Croft is drawn in code. We're using Muse Code, Meta's coding agent, to make the pixel
sprites (see `docs/croft-muse-code.md`).

## Privacy and safety choices

- Students only show up once they've finished the survey, so half-made accounts never appear.
- Cards show a nickname, an avatar, course names, the courses someone wants help with, and the free
  time you share. Grades, confidence ratings, survey answers, email and contact details are never
  shown to anyone.
- Matching never uses who you are: no school ranking, major, year or grade goes into it.
- Connection declines are silent, and someone you asked to connect with only shows their nickname and
  avatar until they accept.
- Every card has Report and Block at the bottom. A report takes a reason and an optional note, and
  only the team reads it. Blocking ends the connection and hides each of you from the other's
  sessions. Neither one tells the other person, and you can unblock from Profile, Account.
- Every action that writes something has a daily limit, and Muse calls have their own limits plus a
  shared budget, so nobody can run up costs or flood other students.
- Row-level security is on for every table. Every change goes through a database function that
  checks who's asking.

## Built with

React 19, TypeScript and Vite, styled with Tailwind and doodle.css. Supabase handles auth (email
codes, Cloudflare Turnstile), Postgres with row-level security, Realtime for chat and live updates,
storage, and the Deno Edge Functions that call Muse. The music is synthesized in the browser with the
Web Audio API from the score Muse writes. The database has more than 350 pgTAP checks in
`supabase/tests`.

## Running it yourself

You'll need Node 20 or newer and a Supabase project.

1. Copy `.env.example` to `.env` at the repo root and fill it in. The `VITE_` keys are the public
   ones the browser uses; the rest stay on the server.
2. Apply the database and deploy the functions:

   ```sh
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   npx supabase secrets set META_API_KEY=<your Meta Model API key>
   npx supabase functions deploy --use-api --no-verify-jwt
   ```

3. Run the app:

   ```sh
   cd StudBuds
   npm install
   npm run dev
   ```

`npm run build` type-checks and builds; `npm run lint` runs oxlint. More detail on the database is in
`docs/database.md`, and on sign-up and email in `docs/auth-setup.md`.

## Deploying on Netlify

`netlify.toml` already builds `StudBuds/` and sends every page to the app. In Netlify, add the three
`VITE_` variables. Then add the site's domain to the Cloudflare Turnstile widget's allowed hostnames,
and set it as the Site URL in Supabase (Authentication, URL Configuration).
