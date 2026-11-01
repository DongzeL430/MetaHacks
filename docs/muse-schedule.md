# Reading schedule screenshots with Muse Spark

On the availability calendar, "Import screenshot" fills in the student's free times from a picture of their class schedule or calendar. Course codes Muse finds become suggested rows on the Courses page.

## How it works

1. `StudBuds/src/utils/ScheduleScreenshot.ts` shrinks the image in the browser (longest side 1600px, JPEG) and calls the Edge Function.
2. `supabase/functions/read-schedule/index.ts` checks the student is logged in and under the daily limit, then sends the image to `muse-spark-1.3` with fixed instructions and a JSON schema.
3. Muse returns each busy block (`day`, `start`, `end`, `label`, `course_code`). The function checks every field again before passing it on.
4. Like the `.ics` import, every visible 30-minute slot that doesn't overlap a block becomes available. The student can adjust or Undo before Continue saves to `availability_slots`.

Tested on 2026-11-01 with a drawn timetable of 7 class blocks and 4 courses: Muse returned all 7 with exact days and times, and all 4 course codes, in about 5 seconds.

## Limits and privacy

- Only signed-in students can call it. Each gets 5 reads a day, counted in `ai_requests` before Meta is called, so failed reads count too. The 6th returns HTTP 429 with a message the page shows as is.
- The image goes straight to Meta and is never stored. Muse runs in Standard mode, where Meta doesn't train on the content.
- Instructions tell Muse to treat text inside the image as data, so a screenshot can't change what it does.
- Cost is about $0.005 per read (roughly 1,500 tokens for the image).

## Deploying

The Meta key lives in the repo-root `.env` as `META_API_KEY` and is sent to Supabase as a function secret. Send only that line, never the whole `.env`:

```sh
grep '^META_API_KEY=' .env > /tmp/meta.env
npx supabase@2.122.0 secrets set --env-file /tmp/meta.env
rm /tmp/meta.env

npx supabase@2.122.0 functions deploy read-schedule --use-api --no-verify-jwt
```

`--use-api` builds the function on Supabase's side, so Docker isn't needed. `--no-verify-jwt` is on purpose: the function checks the login itself with `supabase.auth.getUser`, which works with both legacy and new JWT signing keys.

## Changing it

- Daily limit: `DAILY_LIMIT` in the function.
- What Muse is asked for: `INSTRUCTIONS` and `SCHEMA` in the function. Keep `strict: true`; every property must stay in `required`.
- Speed vs. care: `reasoning_effort` is `low`. Muse can't turn reasoning off (`none` returns 400).
- Function logs (errors and token usage per read) are in the dashboard under Edge Functions > read-schedule > Logs.
