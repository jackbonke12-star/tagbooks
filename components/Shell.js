'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import TopNav from './TopNav';

export default function Shell({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);

  const isLogin = pathname === '/login';

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isLogin && !loading && !session) {
      router.push('/login');
    }
  }, [isLogin, loading, session, router]);

  if (isLogin) {
    return children;
  }

  if (loading) {
    return (
      <div className="splash">
        <span className="splash-brand">TagBooks</span>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="splash">
        <span className="splash-brand">TagBooks</span>
      </div>
    );
  }

  return (
    <>
      <TopNav />
      <main className="page">{children}</main>
    </>
  );
}
