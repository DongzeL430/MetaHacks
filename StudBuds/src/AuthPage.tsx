import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { AuthError, Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase.ts';
import Turnstile from './Turnstile.tsx';
// import AvatarStage from './AvatarStage';

type Mode = 'signup' | 'login';

interface FormValues {
  email: string;
  password: string;
  confirm: string;
}

// Turns Supabase errors into something a student can act on. The sign-up rules (.edu email,
// 18+) already come back from the server with student-facing messages.
function describeError(error: AuthError): string {
  switch (error.code) {
    case 'email_not_confirmed':
      return 'Confirm your email first. Check your inbox for a link from StudBuds.';
    case 'invalid_credentials':
      return 'Wrong email or password.';
    case 'captcha_failed':
      return 'The bot check didn’t go through. Try again.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'weak_password':
      return 'Use a password with at least 8 characters.';
  }
  if (error.name === 'AuthRetryableFetchError') {
    return 'Can’t reach StudBuds right now. Check your connection and try again.';
  }
  return error.message;
}

// An email link that expired or was already used comes back with an error in the URL.
const linkFailed = (): boolean => new URLSearchParams(window.location.hash.slice(1)).has('error');
const LINK_ERROR =
  'That email link has expired or was already used. Sign up again with the same email to get a new one.';

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [values, setValues] = useState<FormValues>({ email: '', password: '', confirm: '' });
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string>(() => (linkFailed() ? LINK_ERROR : ''));
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [sending, setSending] = useState(false);
  const [sentTo, setSentTo] = useState('');
  // undefined until the saved session, or the one in an email link, has been read.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  const signup = mode === 'signup';

  useEffect(() => {
    // Clear the failed link from the address bar so a refresh doesn't show the error again.
    if (linkFailed()) window.history.replaceState(null, '', window.location.pathname);

    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const onChange = (e: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const toggleMode = (): void => {
    setMode(signup ? 'login' : 'signup');
    setError('');
    setSentTo('');
  };

  // Catches problems before anything is sent, so students don't use up rate-limited attempts.
  // The server checks the same rules again.
  const findProblem = (email: string): string => {
    if (!email || !values.password) return 'Enter your email and password.';
    if (signup) {
      if (!/\.edu$/i.test(email)) return 'Please sign up with your school email address (ending in .edu).';
      if (values.password.length < 8) return 'Use a password with at least 8 characters.';
      if (values.password !== values.confirm) return 'Passwords don’t match.';
      if (!adult) return 'You need to confirm that you are 18 or older.';
    }
    if (!captchaToken) return 'The bot check is still loading. Try again in a moment.';
    return '';
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const email = values.email.trim();
    const problem = findProblem(email);
    if (problem) {
      setError(problem);
      return;
    }

    setError('');
    setSending(true);
    const { error: authError } = signup
      ? await supabase.auth.signUp({
          email,
          password: values.password,
          options: {
            data: { adult_confirmed: true },
            captchaToken: captchaToken ?? undefined,
            emailRedirectTo: window.location.origin,
          },
        })
      : await supabase.auth.signInWithPassword({
          email,
          password: values.password,
          options: { captchaToken: captchaToken ?? undefined },
        });
    setSending(false);
    // A bot-check token works once, so get a fresh one for the next attempt.
    setCaptchaReset((n) => n + 1);

    if (authError) setError(describeError(authError));
    else if (signup) setSentTo(email);
  };

  return (
   <div className="doodle w-full h-dvh">
    <main className="w-full h-full grid grid-cols-1 md:grid-cols-2">
      {/* LEFT: 3D avatar stage */}
      <section className="flex flex-col items-center p-6 min-h-0 md:border-r-2 md:border-black">
        <h2 className="text-3xl leading-snug text-center">
          Clickable demo of base 3D avatar
        </h2>
      </section>

        {/* RIGHT: auth form */}
        <section className="p-6 flex flex-col min-h-0 overflow-y-auto">
          {/* Temporary logo, top left */}
          <div className="flex flex-row items-center gap-2">
          <svg
            className="self-start shrink-0"
            width="48"
            height="48"
            viewBox="0 0 48 48"
            role="img"
            aria-label="Logo"
          >
            <circle cx="24" cy="24" r="21" fill="none" stroke="currentColor" strokeWidth="3" />
            <ellipse cx="24" cy="20" rx="5" ry="4" fill="currentColor" />
            <path d="M8 38 Q24 14 40 38 Z" fill="currentColor" />
          </svg>
          <h3>StudBuds</h3>
          </div>

          {/* Form block, centered in the remaining space */}
          <div className="flex-1 flex flex-col justify-center w-full max-w-sm mx-auto">
            <h1 className="text-4xl mb-6">Welcome!</h1>

            {session === undefined ? null : session ? (
              <div className="flex flex-col gap-4">
                <p>You are signed in as {session.user.email}.</p>
                <button type="button" onClick={() => supabase.auth.signOut()} className="self-center px-10 py-2">
                  Log out
                </button>
              </div>
            ) : sentTo ? (
              <div className="flex flex-col gap-4">
                <p>
                  Check your inbox at {sentTo} for a link from StudBuds. It can take a minute, and it
                  might land in spam.
                </p>
                <button type="button" onClick={toggleMode} className="self-center px-10 py-2">
                  Back to log in
                </button>
              </div>
            ) : (
            <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
              <label className="flex flex-col gap-1">
                Email:
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={values.email}
                  onChange={onChange}
                  className="w-full"
                />
              </label>

              <label className="flex flex-col gap-1">
                Password:
                <input
                  type="password"
                  name="password"
                  autoComplete={signup ? 'new-password' : 'current-password'}
                  value={values.password}
                  onChange={onChange}
                  className="w-full"
                />
              </label>

              {signup && (
                <label className="flex flex-col gap-1">
                  Confirm password:
                  <input
                    type="password"
                    name="confirm"
                    autoComplete="new-password"
                    value={values.confirm}
                    onChange={onChange}
                    className="w-full"
                  />
                </label>
              )}

              {signup && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="adult"
                    checked={adult}
                    onChange={(e) => setAdult(e.target.checked)}
                  />
                  I am 18 or older
                </label>
              )}

              <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />

              <p className="text-red-600 min-h-[1.5rem]" role="alert">
                {error}
              </p>

              {/* Big action button with small mode-switching arrows on either side */}
              <div className="mt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={toggleMode}
                  aria-label={signup ? 'Switch to log in' : 'Switch to sign up'}
                  className="px-2 text-xl"
                >
                  ‹
                </button>

                <button type="submit" disabled={sending} className="flex-1 max-w-[14rem] px-10 py-2">
                  {signup ? 'Sign up' : 'Log in'}
                </button>

                <button
                  type="button"
                  onClick={toggleMode}
                  aria-label={signup ? 'Switch to log in' : 'Switch to sign up'}
                  className="px-2 text-xl"
                >
                  ›
                </button>
              </div>
            </form>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
