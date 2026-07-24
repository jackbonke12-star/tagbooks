'use client';

import TopNav from './TopNav';
import PinGate from './PinGate';
import NotesBubble from './NotesBubble';

export default function Shell({ children }) {
  return (
    <PinGate>
      <TopNav />
      <main className="page">{children}</main>
      {/* Global quick-notes bubble, only mounted after PIN unlock. */}
      <NotesBubble />
    </PinGate>
  );
}
