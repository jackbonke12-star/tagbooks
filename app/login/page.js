'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const isSignup = mode === 'signup';

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      if (isSignup) {
        const { error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
      router.push('/');
    } catch (err) {
      setError(err?.message || 'Something went wrong. Try again.');
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <div className="login-box">
        <div className="login-brand">TagBooks</div>
        <p className="login-sub">
          {isSignup ? 'Create your partner account.' : 'Sign in to your workspace.'}
        </p>

        <form onSubmit={onSubmit}>
          <div className="field">
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete={isSignup ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error ? <div className="login-error">{error}</div> : null}

          <button className="btn btn-primary login-submit" type="submit" disabled={busy}>
            {busy ? 'Working...' : isSignup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <button
          className="login-toggle"
          type="button"
          onClick={() => {
            setError('');
            setMode(isSignup ? 'signin' : 'signup');
          }}
        >
          {isSignup ? 'Have an account? Sign in' : 'Create account'}
        </button>
      </div>
    </div>
  );
}
