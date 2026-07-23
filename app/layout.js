import './globals.css';
import Shell from '../components/Shell';

export const metadata = {
  title: 'TagBooks',
  description: 'Business tracker for NFC review-tag kits, websites, and digital menus.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
