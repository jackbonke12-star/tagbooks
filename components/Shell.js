'use client';

import TopNav from './TopNav';

export default function Shell({ children }) {
  return (
    <>
      <TopNav />
      <main className="page">{children}</main>
    </>
  );
}
