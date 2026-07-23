'use client';

import TopNav from './TopNav';
import PinGate from './PinGate';

export default function Shell({ children }) {
  return (
    <PinGate>
      <TopNav />
      <main className="page">{children}</main>
    </PinGate>
  );
}
