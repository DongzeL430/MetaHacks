import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import type { AuthError, Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase.ts';
import Turnstile from './Turnstile.tsx';
import { Canvas } from '@react-three/fiber';
import { Scene } from 'three';
// import AvatarStage from './AvatarStage';

type Mode = 'signup' | 'login';

interface FormValues {
  email: string;
  password: string;
  confirm: string;
}

// The sign-up email holds a code, not a link: school email scanners open links on their own,
// which confirmed accounts nobody had checked. Matches otp_length in supabase/config.toml.
const CODE_LENGTH = 8;

// Turns Supabase errors into something a student can act on. The sign-up rules (.edu email,
// 18+) already come back from the server with student-facing messages.
function describeError(error: AuthError): string {
  switch (error.code) {
    case 'invalid_credentials':
      return 'Wrong email or password.';
    case 'otp_expired':
      return 'That code is wrong or has expired. Check it, or send a new code.';
    case 'captcha_failed':
      return 'The bot check didn’t go through. Try again.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Too many attempts. Wait a few minutes and try again.';
    case 'weak_password':
      return 'Use a password with at least 8 characters.';
  }
  // supabase-js uses this error both for no connection (status 0) and for server errors (5xx).
  if (error.name === 'AuthRetryableFetchError') {
    return error.status === 0
      ? 'Can’t reach StudBuds right now. Check your connection and try again.'
      : `Something went wrong on our side (${error.message}). Try again in a few minutes.`;
  }
  return error.message;
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [values, setValues] = useState<FormValues>({ email: '', password: '', confirm: '' });
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState<string>('');
  const [notice, setNotice] = useState<string>('');
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  const [sending, setSending] = useState(false);
  // Set while waiting for the student to type the code emailed to this address.
  const [confirmEmail, setConfirmEmail] = useState('');
  const [code, setCode] = useState('');
  // undefined until the saved session has been read.
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  const signup = mode === 'signup';

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const onChange = (e: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const toggleMode = (): void => {
    setMode(signup ? 'login' : 'signup');
    setError('');
    setNotice('');
  };

  const showCodeScreen = (email: string, message: string): void => {
    setConfirmEmail(email);
    setCode('');
    setError('');
    setNotice(message);
  };

  const backToLogin = (): void => {
    setConfirmEmail('');
    setMode('login');
    setError('');
    setNotice('');
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

    if (authError?.code === 'email_not_confirmed') {
      showCodeScreen(email, 'Confirm your email first. Enter the code we sent you, or send a new one.');
    } else if (authError) {
      setError(describeError(authError));
    } else if (signup) {
      showCodeScreen(email, `We sent a ${CODE_LENGTH}-digit code to ${email}. It can take a minute, and it might land in junk.`);
    }
  };

  const onVerify = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const token = code.replace(/\s/g, '');
    if (!new RegExp(`^\\d{${CODE_LENGTH}}$`).test(token)) {
      setError(`Enter the ${CODE_LENGTH}-digit code from the email.`);
      return;
    }

    setError('');
    setSending(true);
    const { error: authError } = await supabase.auth.verifyOtp({ email: confirmEmail, token, type: 'email' });
    setSending(false);

    if (authError) setError(describeError(authError));
    else setConfirmEmail('');
  };

  const onResend = async (): Promise<void> => {
    if (!captchaToken) {
      setError('The bot check is still loading. Try again in a moment.');
      return;
    }

    setError('');
    setSending(true);
    const { error: authError } = await supabase.auth.resend({
      type: 'signup',
      email: confirmEmail,
      options: { captchaToken },
    });
    setSending(false);
    setCaptchaReset((n) => n + 1);

    if (authError) setError(describeError(authError));
    else setNotice(`We sent a new code to ${confirmEmail}.`);
  };

  return (
   <div className="doodle w-full h-dvh">
    <main className="w-full h-full grid grid-cols-1 md:grid-cols-2">
      {/* LEFT: 3D avatar stage */}
      <section className="flex flex-col items-center p-6 min-h-0 md:border-r-2 md:border-black">
        {/* <h2 className="text-3xl leading-snug text-center">
          Clickable demo of base 3D avatar
        </h2> */}
        <Canvas>
          <directionalLight intensity={0.5}/>
          
        </Canvas>
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
            ) : confirmEmail ? (
            <form onSubmit={onVerify} className="flex flex-col gap-4" noValidate>
              <p>{notice}</p>

              <label className="flex flex-col gap-1">
                Code:
                <input
                  type="text"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={CODE_LENGTH + 2}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="w-full"
                />
              </label>

              <Turnstile onToken={setCaptchaToken} resetKey={captchaReset} />

              <p className="text-red-600 min-h-[1.5rem]" role="alert">
                {error}
              </p>

              <div className="mt-2 flex flex-col items-center gap-3">
                <button type="submit" disabled={sending} className="w-full max-w-[14rem] px-10 py-2">
                  Confirm
                </button>
                <div className="flex gap-3">
                  <button type="button" onClick={onResend} disabled={sending} className="px-3 py-1">
                    Send a new code
                  </button>
                  <button type="button" onClick={backToLogin} className="px-3 py-1">
                    Back to log in
                  </button>
                </div>
              </div>
            </form>
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
