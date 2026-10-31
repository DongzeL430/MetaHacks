import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
// import AvatarStage from './AvatarStage';

type Mode = 'signup' | 'login';

interface FormValues {
  email: string;
  password: string;
  confirm: string;
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [values, setValues] = useState<FormValues>({ email: '', password: '', confirm: '' });
  const [error, setError] = useState<string>('');

  const signup = mode === 'signup';

  const onChange = (e: ChangeEvent<HTMLInputElement>) =>
    setValues((v) => ({ ...v, [e.target.name]: e.target.value }));

  const toggleMode = (): void => {
    setMode(signup ? 'login' : 'signup');
    setError('');
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!values.email || !values.password) {
      setError('Enter your email and password.');
    } else if (signup && values.password !== values.confirm) {
      setError('Passwords don\u2019t match.');
    } else {
      setError('');
      // TODO: send to your backend here
      console.log(mode, { email: values.email });
    }
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

                <button type="submit" className="flex-1 max-w-[14rem] px-10 py-2">
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
          </div>
        </section>
      </main>
    </div>
  );
}
