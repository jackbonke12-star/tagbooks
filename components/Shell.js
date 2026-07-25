'use client';

import { usePathname } from 'next/navigation';
import TopNav from './TopNav';
import PinGate from './PinGate';
import NotesBubble from './NotesBubble';

export default function Shell({ children }) {
  const pathname = usePathname();

  // Public WiFi-gate pages (/w/<slug>) are customer-facing: render them bare,
  // with no PIN and no app chrome, so a customer can open the link and get the
  // WiFi without hitting our staff PIN.
  if (pathname && pathname.startsWith('/w/')) {
    return children;
  }

  return (
    <PinGate>
      <TopNav />
      <main className="page">{children}</main>
      {/* Global quick-notes bubble, only mounted after PIN unlock. */}
      <NotesBubble />
    </PinGate>
  );
}
