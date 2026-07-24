'use client';

import './TabTip.css';
import { useEffect, useState } from 'react';

// A small, dismissible first-run note for a tab. Reads / writes a per-tip flag
// in localStorage (key `tagbooks-tip-<id>`) so it only shows until dismissed.
//
// SSR-safe: renders nothing on the server and on the very first client render,
// then a mount effect flips it on only if it hasn't already been dismissed.
// That keeps server and first client render identical (no hydration mismatch)
// and avoids a flash for users who already tapped "Got it".
export default function TabTip({ id, children }) {
  const [show, setShow] = useState(false);

  const storageKey = `tagbooks-tip-${id}`;

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (window.localStorage.getItem(storageKey) !== 'dismissed') {
        setShow(true);
      }
    } catch {
      // localStorage blocked (private mode) — just show the tip this session.
      setShow(true);
    }
  }, [storageKey]);

  function dismiss() {
    setShow(false);
    try {
      window.localStorage.setItem(storageKey, 'dismissed');
    } catch {
      // Non-fatal: it will simply reappear next time if we couldn't persist.
    }
  }

  if (!show) return null;

  return (
    <div className="tabtip" role="note">
      <span className="tabtip-tag">TIP</span>
      <p className="tabtip-text">{children}</p>
      <button
        type="button"
        className="tabtip-dismiss"
        onClick={dismiss}
        aria-label="Dismiss tip"
      >
        Got it
      </button>
    </div>
  );
}
