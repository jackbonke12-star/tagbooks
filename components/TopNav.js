'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

// Pages that live under the "More" menu (occasional / secondary use).
const MORE_ITEMS = [
  { href: '/places', label: 'Places' },
  { href: '/products', label: 'Products' },
  { href: '/coins', label: 'Coins' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/recurring', label: 'Recurring' },
  { href: '/requests', label: 'Requests' },
];

// True when the current path matches a nav route (exact or nested).
function matches(pathname, href) {
  return pathname === href || pathname.startsWith(href + '/');
}

export default function TopNav() {
  const pathname = usePathname();

  // Dropdown starts closed so SSR and first client render agree (no hydration
  // mismatch). Nothing browser-only is read during render.
  const [open, setOpen] = useState(false);
  const moreRef = useRef(null);

  const isDash = pathname === '/';
  const isMoney = matches(pathname, '/money');
  const isClients = matches(pathname, '/clients');
  const onMorePage = MORE_ITEMS.some((item) => matches(pathname, item.href));

  // Close on route change (selecting an item navigates, then this closes it).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Click-outside + Escape close the menu. Only wired while open.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e) {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <nav className="topnav">
      <span className="topnav-brand">TagBooks</span>
      <div className="topnav-links">
        <Link className={'topnav-link' + (isDash ? ' on' : '')} href="/">
          Dashboard
        </Link>
        <Link className={'topnav-link' + (isMoney ? ' on' : '')} href="/money">
          Money
        </Link>
        <Link
          className={'topnav-link' + (isClients ? ' on' : '')}
          href="/clients"
        >
          Clients
        </Link>

        <div className="topnav-more" ref={moreRef}>
          <button
            type="button"
            className={
              'topnav-link topnav-more-btn' + (onMorePage ? ' on' : '')
            }
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            More
            <span className="topnav-caret" aria-hidden="true" />
          </button>

          {open ? (
            <div className="topnav-menu" role="menu">
              {MORE_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  role="menuitem"
                  className={
                    'topnav-menu-item' +
                    (matches(pathname, item.href) ? ' on' : '')
                  }
                  href={item.href}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
