// Creates the view-only demo login that shows one student's account (see
// supabase/migrations/*_demo_viewer.sql). Running it again makes the login afresh with a new
// password, which is also how to rotate the password: the database won't let a demo login's
// password or email change in place.
//
// From the repo root:
//   node --env-file=.env scripts/demo-account.mjs <student email> [demo email] [password]
//
// The student must already exist. The demo email defaults to employer-demo@studbuds-demo.edu: it
// has to be .edu to pass the sign-up rules, and it's confirmed here, so no email is ever sent.
// Without a password, a random one is made. The script prints the two lines for .env (and for
// Netlify's environment variables) that turn on the "Try the demo" button.

import { randomBytes } from 'node:crypto';

const url = process.env.VITE_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const [studentEmail, demoEmail = 'employer-demo@studbuds-demo.edu', password = randomBytes(12).toString('base64url')] =
  process.argv.slice(2);

if (!url || !secret) throw new Error('Run with --env-file=.env (needs VITE_SUPABASE_URL and SUPABASE_SECRET_KEY).');
if (!studentEmail) throw new Error('Usage: node --env-file=.env scripts/demo-account.mjs <student email> [demo email] [password]');
if (password.length < 8) throw new Error('Use a password with at least 8 characters.');

async function admin(path, init = {}) {
  const res = await fetch(`${url}/auth/v1/admin/${path}`, {
    ...init,
    headers: { apikey: secret, 'Content-Type': 'application/json', ...init.headers },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${res.status} ${body.msg ?? body.message ?? JSON.stringify(body)}`);
  return body;
}

async function findUser(email) {
  for (let page = 1; ; page++) {
    const { users } = await admin(`users?page=${page}&per_page=200`);
    const found = users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (found || users.length < 200) return found ?? null;
  }
}

const student = await findUser(studentEmail);
if (!student) throw new Error(`No account for ${studentEmail}.`);
if (student.app_metadata?.demo_of) throw new Error(`${studentEmail} is itself a demo login.`);

const old = await findUser(demoEmail);
if (old) {
  if (!old.app_metadata?.demo_of) throw new Error(`${demoEmail} is a real student's account, not a demo login. Pick another email.`);
  await admin(`users/${old.id}`, { method: 'DELETE' });
  console.log(`Removed the old demo login (it showed ${old.app_metadata.demo_of}).`);
}

const created = await admin('users', {
  method: 'POST',
  body: JSON.stringify({
    email: demoEmail,
    password,
    email_confirm: true,
    user_metadata: { adult_confirmed: true },
    app_metadata: { demo_of: student.id },
  }),
});

console.log(`Demo login ${created.email} now shows ${studentEmail} (${student.id}), view only.`);
console.log('\nAdd these to .env and to the Netlify site\'s environment variables, then rebuild:\n');
console.log(`VITE_DEMO_EMAIL=${demoEmail}`);
console.log(`VITE_DEMO_PASSWORD=${password}`);
