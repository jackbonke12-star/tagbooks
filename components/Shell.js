'use client';

import { usePathname } from 'next/navigation';
import TopNav from './TopNav';
import PinGate from './PinGate';
import NotesBubble from './NotesBubble';

export default function Shell({ children }) {
  const pathname = usePathname();

  // Public customer-facing pages render bare — no PIN, no app chrome — so a
  // customer who taps an NFC coin lands straight on the page:
  //   /w/<slug>  WiFi-gate pages
  //   /r/<slug>  Review Tap pages
  if (pathname && (pathname.startsWith('/w/') || pathname.startsWith('/r/'))) {
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
