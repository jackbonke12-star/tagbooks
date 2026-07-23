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
  const isInventory =
    pathname === '/inventory' || pathname.startsWith('/inventory/');
  const isRecurring =
    pathname === '/recurring' || pathname.startsWith('/recurring/');

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
        <Link
          className={'topnav-link' + (isInventory ? ' on' : '')}
          href="/inventory"
        >
          Inventory
        </Link>
        <Link
          className={'topnav-link' + (isRecurring ? ' on' : '')}
          href="/recurring"
        >
          Recurring
        </Link>
      </div>
      <button className="topnav-signout" onClick={signOut} type="button">
        Sign out
      </button>
    </nav>
  );
}
