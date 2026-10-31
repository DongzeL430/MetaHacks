# Database for the frontend

What each table holds and what the frontend can do with it. Sign-up and keys are covered in [auth-setup.md](auth-setup.md).

The frontend talks to these tables directly with supabase-js and the publishable key. Row level security makes every query return only what the signed-in student is allowed to see, so no API routes are needed for any of this.

## Connecting

```ts
// StudBuds/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../../../supabase/database.types'

export const supabase = createClient<Database>(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
)
```

`supabase/database.types.ts` is generated from the live schema, so table names, column names, and allowed values (like letter grades) autocomplete and type-check. Regenerate it after every migration:

```sh
npx supabase@2.122.0 gen types typescript --linked --schema public > supabase/database.types.ts
```

## Never send these

`user_id`, `created_by`, and `university_domain` fill themselves from the signed-in student. Sending them is rejected, which is what stops anyone writing rows for someone else.

## Tables

Other students can't see any of these rows except where noted. Server code with the secret key can read everything.

| Table | Holds | The student can | Limit |
|---|---|---|---|
| `profiles` | University, major, 18+ time, onboarding status, Instagram, Discord, phone | Read their own row; update `major`, `instagram`, `discord`, `phone` | 1 row |
| `public_profiles` | Nickname, animal, equipped accessories, points | Read their own, and other students' once onboarded | Read only |
| `courses` | Shared course list per school | Read their school's list; add a code | 15 new codes |
| `user_courses` | Courses taking or completed, with self-reported grade | Add, update `status` and `grade`, remove | 40 |
| `availability_slots` | Weekly free time | Add, edit, remove | 30 |
| `survey_questions` | This or That questions | Read approved ones | Read only |
| `survey_answers` | Their pick, `a` or `b`, per question | Answer, change, remove | 1 per question |
| `interests` | The fixed interest list | Read | Read only |
| `user_interests` | Interests they picked | Add, remove | 10 |
| `accessories` | Penguin accessory catalog | Read approved ones | Read only |
| `user_accessories` | Accessories they own | Read | Read only (unlocked by server) |
| `universities` | School domains and names | Read | Read only |

## Formats

- **Course codes:** uppercase, single spaces, letters, digits, `.`, `-`, `/`, 2 to 20 characters, e.g. `CS 2500`. `CS2500` and `CS 2500` count as the same course. Search the list before adding, and add only if the code is missing.
- **Grades:** `A` `A-` `B+` `B` `B-` `C+` `C` `C-` `D+` `D` `D-` `F` `P`. Optional while `status` is `taking`, required for `completed`.
- **Availability:** `weekday` is 1 (Monday) to 7 (Sunday), times like `'09:00'`, in the school's local time. The end must be after the start.
- **Instagram:** without the `@`, up to 30 letters, digits, `.` or `_`.
- **Discord:** lowercase, 2 to 32 letters, digits, `.` or `_`.
- **Phone:** international format, e.g. `+16175550100`.

## Errors to handle

| `error.code` | Meaning | Show |
|---|---|---|
| `23514` | A limit or format rule. The limit message reads "You can add at most N of these". | The message, or a format hint |
| `23505` | Already added | Usually nothing; treat it as done |
| `23503` | Picked something not on the list | Refresh the list |
| `42501` | Not allowed (someone else's row, an unapproved question, a column the student can't set) | A generic error; this usually means a bug |

## Examples

```ts
// Add a course the student is taking
const { data: course } = await supabase.from('courses').select('id').eq('code', 'CS 2500').maybeSingle()
await supabase.from('user_courses').insert({ course_id: course!.id, status: 'taking' })

// A finished course needs a grade
await supabase.from('user_courses').insert({ course_id, status: 'completed', grade: 'A-' })

// Weekly free time
await supabase.from('availability_slots').insert({ weekday: 1, starts_at: '09:00', ends_at: '11:00' })

// This or That: first answer, then changing it
await supabase.from('survey_answers').insert({ question_id, choice: 'a' })
await supabase.from('survey_answers').update({ choice: 'b' }).eq('question_id', question_id)

// Contact handles (private)
await supabase.from('profiles').update({ instagram: 'sleepy.reads' }).eq('id', userId)
```

Use `insert` and `update` rather than `upsert`. An upsert also rewrites columns like `question_id` that students aren't allowed to change, so it gets rejected.
