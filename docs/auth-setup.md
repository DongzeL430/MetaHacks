# Accounts setup

This covers step 1 of the user data layer: sign-up rules, the two profile tables, and how to apply them to the hosted Supabase project.

Everything runs through the Supabase CLI via `npx`, pinned to one version so we both get the same behavior. No global install is needed.

## What's in place

| Piece | Where | What it does |
|---|---|---|
| `universities` | migration | One row per school domain. Northeastern is named; other .edu domains are added on first sign-up and named by hand later. |
| `profiles` | migration | Private per-user data: university, major, when 18+ was confirmed, onboarding status. Only the owner can read it. |
| `public_profiles` | migration | What other students see: nickname, animal, equipped accessories, points. Hidden until the account finishes onboarding. |
| Before User Created hook | migration + `config.toml` | Rejects non-.edu emails and sign-ups without the 18+ flag, with a readable error message. |
| New-user trigger | migration | Repeats the hook's checks, then creates both profile rows and a nickname like "Sleepy Penguin 42". |
| Email-change trigger | migration | Stops a user from switching their login to a non-.edu address. Moving to another .edu updates their university. |
| Auth settings | `config.toml` | Password at least 8 characters. Email confirmation required, so nobody can sign up with someone else's address. |

Passwords are hashed and stored by Supabase Auth in `auth.users`. Our tables never hold them.

Users can change only their own `major`. Points, nickname, and onboarding status are changed by server code with the service key.

Deleting a user in Supabase Auth deletes both of their profile rows.

## Apply it to the hosted project

One time, from the repo root:

```sh
npx supabase@2.122.0 login
npx supabase@2.122.0 link --project-ref <project-ref>
```

The project ref is in the dashboard URL: `supabase.com/dashboard/project/<project-ref>`. `link` asks for the database password.

Then:

```sh
npx supabase@2.122.0 db push --linked   # creates the tables, functions, and triggers (run first)
npx supabase@2.122.0 config diff        # preview auth setting changes
npx supabase@2.122.0 config push        # apply them; it asks before each change
npx supabase@2.122.0 test db --linked   # 64 checks in supabase/tests, rolled back afterwards (needs Docker)
```

`test db` runs its test tool inside Docker, even with `--linked`. Without Docker, the tests can still run through `db query --linked`, wrapped in a function that collects the results and forces a rollback. That is how they were run on 2026-10-30 and 2026-10-31: all passed, and no test rows were left behind.

The tables added in step 2 are described in [database.md](database.md).

## Keys

Keys live only in `.env` at the repo root, which git ignores. `.env.example` lists the names and is committed.

```sh
cp .env.example .env
npx supabase@2.122.0 projects api-keys --project-ref <project-ref> --reveal
```

Without `--reveal` the secret key comes back masked, and every admin call fails with "Invalid API key".

- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are safe in the browser. Row level security limits what the publishable key can do.
- `SUPABASE_SECRET_KEY` bypasses row level security. Use it only in server code, and send it in the `apikey` header. It is not a JWT, so `Authorization: Bearer <secret>` is rejected.
- The frontend is Vite, which only exposes `VITE_` variables to the browser and normally reads `.env` from its own folder. `StudBuds/vite.config.ts` needs `envDir: '..'` so it reads this root `.env`. Anything without the `VITE_` prefix never reaches the browser, which is what keeps the secret keys safe.

## Notes on `config push`

`config push` sends every setting declared in `config.toml`, including `site_url = "http://localhost:3000"`. Two changes are still to make:

- Vite's dev server runs on `http://localhost:5173`, so `site_url` (or `additional_redirect_urls`) needs that address before confirmation links work in development.
- Once the app has a real URL, add it to both, or confirmation links will point at localhost.

Settings `config push` doesn't manage, such as the hourly email limit, are changed in the dashboard.

## Bot protection and email: in progress

**Cloudflare Turnstile (free bot check).** Once CAPTCHA is on in Supabase, every sign-up and sign-in without a valid token is rejected, so nothing but our own sign-up page can create accounts.

1. Create a free Cloudflare account at dash.cloudflare.com. No domain is needed.
2. Turnstile > Add widget. Name it StudBuds, add the hostname `localhost`, choose Managed mode.
3. Put the site key in `VITE_TURNSTILE_SITE_KEY` and the secret key in `TURNSTILE_SECRET` in `.env`.
4. Uncomment `[auth.captcha]` in `config.toml`, then:
   ```sh
   set -a; source .env; set +a
   npx supabase@2.122.0 config diff
   npx supabase@2.122.0 config push
   ```
5. When the app has a real URL, add it to the widget's hostnames and remove `localhost`.

**Email sending: Gmail SMTP (free, about 500 emails a day).** Until this is on, Supabase's built-in sender only delivers to members of our Supabase team, at 2 emails per hour, so real students never get their confirmation link.

1. Create a Gmail account for the project.
2. Turn on 2-Step Verification for it (Google Account > Security).
3. Create an app password (Google Account > Security > App passwords). Google shows 16 characters.
4. Put the Gmail address in `SMTP_USER` and the app password, without spaces, in `SMTP_PASS` in `.env`.
5. Uncomment `[auth.email.smtp]` in `config.toml`, then load `.env` and run `config diff` and `config push` as above.
6. In the dashboard, Authentication > Rate Limits, raise the hourly email limit. It starts at 30 with custom SMTP; 100 leaves room for launch day and stays under Gmail's daily cap.
7. Sign up with a real .edu address and check that the email arrives and isn't in spam or quarantine. University mail filters are stricter than personal inboxes.

**Rate limits.** Sign-up and sign-in stay at Supabase's default of 30 requests per 5 minutes per IP. Students on campus Wi-Fi often share one public IP, so tightening this could lock out real users on launch day. Tables students write to have their own per-student limits; see [database.md](database.md).

## Contract for the sign-up page

The 18+ checkbox value has to be sent as `adult_confirmed` inside `options.data`. Without it the sign-up is rejected.

```ts
const { error } = await supabase.auth.signUp({
  email,
  password,
  options: {
    data: { adult_confirmed: true },
    captchaToken, // once Turnstile is on
    emailRedirectTo: `${window.location.origin}/auth/callback`,
  },
});
```

Messages the form should show when `error.message` matches:

- "Please sign up with your school email address (ending in .edu)."
- "You need to confirm that you are 18 or older."

After sign-up, the user has to click the confirmation email before they can sign in.

## Things that will trip you up

- The hook only runs on public sign-ups. Users created through the dashboard or the admin API skip it, and the trigger enforces the same two rules with a generic "Database error" message instead.
- Creating a user with "Add user" in the dashboard fails, because the dashboard can't send the 18+ flag. Create test users through the sign-up call, or the admin API with `user_metadata: { adult_confirmed: true }`.
- Checked live on 2026-10-30: the hook receives `options.data` from a real sign-up. A .edu sign-up with the flag was accepted, one without it got the 18+ message, and a gmail address got the .edu message.
- `config.toml` mirrors the hosted project's settings on purpose. The CLI's template defaults differ from a hosted project, so run `config diff` before every `config push`.
- The hook is set in `config.toml`. If someone turns it off in the dashboard, the trigger still blocks bad sign-ups, but the user sees a generic "Database error saving new user" instead of the readable message.
- `generate_nickname` checks for an existing nickname before using one. Two people signing up in the same instant with the same random draw would make one sign-up fail. At our scale that's unlikely; retrying works.
