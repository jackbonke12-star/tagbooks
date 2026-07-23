'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';

export default function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  const isDash = pathname === '/';
  const isClients = pathname === '/clients' || pathname.startsWith('/clients/');
  const isMoney = pathname === '/money' || pathname.startsWith('/money/');

  return (
    <nav className="topnav">
      <span className="topnav-brand">TagBooks</span>
      <div className="topnav-links">
        <Link className={'topnav-link' + (isDash ? ' on' : '')} href="/">
          Dashboard
        </Link>
        <Link
          className={'topnav-link' + (isClients ? ' on' : '')}
          href="/clients"
        >
          Clients
        </Link>
        <Link className={'topnav-link' + (isMoney ? ' on' : '')} href="/money">
          Money
        </Link>
      </div>
      <button className="topnav-signout" onClick={signOut} type="button">
        Sign out
      </button>
    </nav>
  );
}
