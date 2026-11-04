<p align="center"><img src="StudBuds/public/logo.png" alt="The StudBuds bear, reading on a green blanket" width="160"></p>

# StudBuds

Finding someone to study with in college is weirdly hard. Group chats are noisy, asking a stranger
after class is awkward, and most "study buddy" apps want your name, photo and major before they show
you anyone. StudBuds goes the other way. You're a nickname and a drawing, and the app puts the
sessions most likely to suit you at the top.

**Live site:** [studbudstm.netlify.app](https://studbudstm.netlify.app)

We built StudBuds for the [Meta Global AI Developer Hackathon](https://cerebralvalley.ai/e/meta-ai-developer-hackathon).
Everything in this repo was made during the hackathon.

## What it does

You sign up with your school `.edu` email. StudBuds gives you a random nickname (something like
"Merry Ladybug") and Muse draws you an avatar to go with it. Nobody sees your real name.

A short survey sets you up. You mark your free time on a calendar, import it from an `.ics` file, or
drop in a screenshot of your class schedule and let Muse read it. You add the courses you've taken or
are taking, each with how confident you feel (1 means lost, 5 means you could teach it), and Muse can
look up your major's courses in your school's catalog to fill the list faster. Then a few questions
about how you like to study, and eight quick "this or that" picks, like early bird or night owl. Each
page saves as you go, so closing the tab halfway through is fine.

After that you land on Home, which works like a small desktop:

- **Study Lobbies** lists sessions other students are hosting, best fit first. Each one says why it's
  there: "Covers a course you want help with", "Similar study habits", "You agreed on 6 of 8 quick
  picks". On top of that ranking, Muse looks at your best few against how you like to study and
  marks up to three as "Muse's pick", with a reason, like "In your free time on Tuesday, and a
  small group". It starts with your own school. Turn off "Only my school" in Filters to see
  sessions at other schools too.
- **Host a session** picks a subject, a time and a place. The places are real study spots at your
  school that Muse found on your school's own website.
- Inside a lobby you can ask to join, chat live with the group, invite your connections, and connect
  with people you'd like to study with again. Hosts accept requests, lock the session or remove
  someone.
- **Sessions** keeps every session you're part of in one place: the ones you host, the ones you've
  joined, requests still waiting on a host, and invites from your connections.
- **Connections** is your friends list. When you're ready to keep in touch outside StudBuds, turn on
  "Share my contact" for one person and they'll see the Discord, Instagram or phone you added in
  your profile. Nobody else does.
- **Your profile** (click your nickname in the nav bar) holds everything from the survey, so you can
  change your free time, courses and answers later. You can also rename yourself or have Muse redraw
  your avatar, up to three changes a day.
- **Themes** turn a sentence ("rainy afternoon in a Scottish library") into a whole look: Muse
  writes the color palette, Muse Image paints the background, and Muse composes a short music box tune
  for it, which loops quietly while you study. The theme picker and the music controls are in the
  gear menu at the right end of the nav bar.
- **Croft**, under "Upcoming" in the same gear menu, is a tiny Celtic farm of your own: a thatched
  cottage, a barn and a fountain, with sheep wandering the meadow and bleating now and then (on the
  music's volume). You grow six crops and place decorations, visit other students' crofts (at any
  school) from their profile cards or the village list, and water one crop a day for them. It's
  there to make the site feel like a place with people in it.
- The **activity feed** at the bottom right pops up quiet messages as things happen: a new session
  that fits you, someone visiting or watering your croft.

## Try it

1. Open [the site](https://studbudstm.netlify.app) and sign up with your `.edu` email. You'll get an
   8-digit code by email (no links, so school mail scanners can't use it up).
2. Go through the survey. Try the schedule screenshot on the calendar page and "Auto-fill courses" on
   the courses page if you want to see Muse at work.
3. On Home, the welcome tour shows you around. Open Study Lobbies and host a session.
4. To see the live parts (join requests, chat, connections, croft visits), sign up a second account
   in another browser or a private window, and join the first account's session. If the two
   accounts are at different schools, turn off "Only my school" in the lobby Filters first.
5. Open the gear at the right end of the nav bar. The paintbrush makes a theme, and Upcoming has the
   Croft.

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
| Muse's picks | Muse Spark 1.3 | Looks at your best-ranked sessions against how you like to study (time of day, length, place, group size) and puts its three best first, with a reason each. It sees no hosts, names, ratings or anyone else's answers |
| Themes | Muse Spark 1.3, Muse Image | Writes a readable color palette, paints and checks a background, composes a tune |

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
- Anything that reaches other students is rate-limited: hosting, join and connection requests,
  invites, reports and blocks have daily limits, and chat is capped at 20 messages a minute. Muse calls
  have their own per-student limits plus a shared daily budget, so nobody can run up costs.
- Row-level security is on for every table, so a student can only read and change what's theirs.
  Anything that involves another student (joining, connecting, inviting, blocking, reporting) goes
  through a database function that checks who's asking and whether it's allowed.

## Built with

React 19, TypeScript and Vite 8, styled with Tailwind 4 and doodle.css. Supabase handles auth (email
codes, Cloudflare Turnstile), Postgres with row-level security, Realtime for chat and live updates,
storage, and the Deno Edge Functions that call Muse. The music is synthesized in the browser with the
Web Audio API from the score Muse writes, and so are the croft's sheep bleats. The croft's pixel art
(the farm, every crop at each stage of growth, the decorations) is drawn in code, with no image
files. The database has more than 400 pgTAP checks in `supabase/tests`.

## Running it yourself

You'll need Node 22.12 or newer (or 20.19+ on Node 20), which Vite 8 needs, and a Supabase
project.

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

Link previews (Devpost, Slack, texts) use the site's full address in `StudBuds/index.html`
(`og:url` and `og:image`), so change both if the site moves.
