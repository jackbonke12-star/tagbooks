'use client';

import { useEffect, useRef } from 'react';
import { supabase } from './supabase';

// Subscribe to Supabase Realtime postgres_changes for the given tables and run
// `onChange` (debounced ~250ms) whenever any of them fire. A burst of changes
// collapses into a single reload. Cleans up the channel on unmount.
//
// Safe if Supabase is unreachable or configured with placeholder env vars: the
// subscribe call is wrapped so a bad client never throws or crashes the page.
//
// Usage: useRealtime(['sales', 'expenses'], load)
export function useRealtime(tables, onChange) {
  // Keep the latest callback in a ref so re-renders don't force a re-subscribe.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Stable join key: only re-subscribe when the actual table list changes.
  const list = Array.isArray(tables) ? tables : [];
  const key = list.join(',');

  useEffect(() => {
    if (!key) return undefined;

    const names = key.split(',').filter(Boolean);
    let timer = null;

    // Debounced fire: coalesce a burst of changes into one onChange call.
    function schedule() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        const cb = onChangeRef.current;
        if (typeof cb === 'function') cb();
      }, 250);
    }

    let channel;
    try {
      channel = supabase.channel(`realtime:${names.join('-')}`);
      for (const table of names) {
        channel.on(
          'postgres_changes',
          { event: '*', schema: 'public', table },
          schedule
        );
      }
      channel.subscribe();
    } catch {
      // Placeholder/unreachable Supabase: never throw, just skip realtime.
      channel = null;
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (channel) {
        try {
          supabase.removeChannel(channel);
        } catch {
          /* best-effort cleanup */
        }
      }
    };
  }, [key]);
}
