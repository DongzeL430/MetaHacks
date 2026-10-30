# Accounts setup

This covers step 1 of the user data layer: sign-up rules, the two profile tables, and how to apply them to the hosted Supabase project.

Everything runs through the Supabase CLI via `npx`, pinned to one version so we both get the same behavior. No global install or Docker is needed.

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
npx supabase@2.122.0 test db --linked   # 25 checks, rolled back afterwards (needs Docker)
```

`test db` runs its test tool inside Docker, even with `--linked`. Without Docker, the tests can still run through `db query --linked`, wrapped in a function that collects the results and forces a rollback. That is how they were run on 2026-10-30: all 25 passed, and no test rows were left behind.

## Keys

Keys live only in `.env` at the repo root, which git ignores. `.env.example` lists the names and is committed.

```sh
cp .env.example .env
npx supabase@2.122.0 projects api-keys --project-ref <project-ref> --reveal
```

Without `--reveal` the secret key comes back masked, and every admin call fails with "Invalid API key".

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is safe in the browser. Row level security limits what it can do.
- `SUPABASE_SECRET_KEY` bypasses row level security. Use it only in server code, and send it in the `apikey` header. It is not a JWT, so `Authorization: Bearer <secret>` is rejected.

## Notes on `config push`

`config push` sends every setting declared in `config.toml`, including `site_url = "http://127.0.0.1:3000"`. That is fine until the app has a real URL, at which point `site_url` and `additional_redirect_urls` need updating, or confirmation links will point at localhost.

## Not switched on yet

**Cloudflare Turnstile (bot check).** It waits until the sign-up page exists. Once CAPTCHA is on in Supabase, every sign-up and sign-in without a valid token is rejected, so turning it on early would block all sign-ups. When the page is ready:

1. Create a Turnstile widget in the Cloudflare dashboard and note the site key and secret key.
2. In `config.toml`, uncomment `[auth.captcha]`, set `provider = "turnstile"` and `secret = "env(TURNSTILE_SECRET)"`, then `config push` with that env var set. The dashboard path is Authentication > Attack Protection.
3. The site key goes in the frontend env as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. The secret never goes in the repo.

**Email sending.** Undecided. Until a custom SMTP provider is set up, Supabase's built-in sender only delivers to members of our Supabase team, at 2 emails per hour. That is enough for us to test, but not for real students.

**Rate limits.** These stay at Supabase's defaults (30 sign-up and sign-in requests per 5 minutes per IP). Students on campus Wi-Fi often share one public IP, so tightening this could lock out real users on launch day.

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
