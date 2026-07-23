'use client';

// Shared-PIN gate for the whole UI.
//
// SSR/hydration-safe: renders a neutral 'checking' splash on the server and the
// first client render (localStorage is only read inside useEffect), so server
// and client markup agree. On mount it tries the stored PIN against /api/auth;
// if it verifies (or the gate is disabled server-side) the app renders,
// otherwise a PIN entry screen is shown.
//
// The PIN itself never lives in a client-visible constant - it is only ever
// compared server-side against APP_PIN.

import { useEffect, useRef, useState } from 'react';

const STORE_KEY = 'tagbooks-pin';

function readStoredPin() {
  if (typeof window === 'undefined') return '';
  try {
    return localStorage.getItem(STORE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredPin(pin) {
  try {
    localStorage.setItem(STORE_KEY, pin);
  } catch {
    // Ignore storage failures (private mode); the current session still works.
  }
}

async function verifyPin(pin) {
  const res = await fetch('/api/auth', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pin }),
    cache: 'no-store',
  });
  const data = await res.json();
  // disabled => no APP_PIN set on the server, treat as unlocked.
  return !!(data && (data.ok || data.disabled));
}

export default function PinGate({ children }) {
  // 'checking' | 'locked' | 'unlocked'. Start in 'checking' so SSR and the first
  // client render match (nothing browser-only read during render).
  const [phase, setPhase] = useState('checking');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef(null);

  // On mount: if a PIN is stored, verify it. If none, or invalid, prompt.
  useEffect(() => {
    let cancelled = false;
    const stored = readStoredPin();
    if (!stored) {
      // Still hit the API so an unconfigured (disabled) gate unlocks with no PIN.
      verifyPin('')
        .then((ok) => {
          if (cancelled) return;
          setPhase(ok ? 'unlocked' : 'locked');
        })
        .catch(() => {
          if (!cancelled) setPhase('locked');
        });
      return () => {
        cancelled = true;
      };
    }
    verifyPin(stored)
      .then((ok) => {
        if (cancelled) return;
        setPhase(ok ? 'unlocked' : 'locked');
      })
      .catch(() => {
        if (!cancelled) setPhase('locked');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    const entered = pin.trim();
    if (!entered) {
      setError('Enter the PIN.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const ok = await verifyPin(entered);
      if (ok) {
        writeStoredPin(entered);
        setPhase('unlocked');
      } else {
        setError('Wrong PIN');
        setPin('');
        if (inputRef.current) inputRef.current.focus();
      }
    } catch {
      setError('Could not verify. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === 'unlocked') {
    return children;
  }

  if (phase === 'checking') {
    // Minimal centered brand splash - matches server render (renders nothing
    // browser-specific) and holds the viewport so there's no flash of the app.
    return (
      <div className="splash" aria-hidden="true">
        <div className="splash-brand">TagBooks</div>
      </div>
    );
  }

  // Locked: PIN entry screen.
  return (
    <div className="login">
      <form className="login-box" onSubmit={onSubmit}>
        <div className="login-brand">TagBooks</div>
        <p className="login-sub">Enter the PIN to continue.</p>

        {error ? <div className="login-error">{error}</div> : null}

        <div className="field">
          <label className="label" htmlFor="pin-input">
            PIN
          </label>
          <input
            id="pin-input"
            ref={inputRef}
            className="input"
            type="password"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary login-submit"
          disabled={submitting}
        >
          {submitting ? 'Checking…' : 'Enter'}
        </button>
      </form>
    </div>
  );
}
