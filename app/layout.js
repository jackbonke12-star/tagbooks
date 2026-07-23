import './globals.css';
import Shell from '../components/Shell';

export const metadata = {
  title: 'TagBooks',
  description: 'Business tracker for NFC review-tag kits, websites, and digital menus.',
};

// Runs before paint (pre-hydration) so the theme is applied with no flash and
// no hydration mismatch. Reads localStorage 'tagbooks-theme', defaults to light.
const themeInit = `(function(){try{var t=localStorage.getItem('tagbooks-theme');document.documentElement.dataset.theme=(t==='dark'?'dark':'light');}catch(e){document.documentElement.dataset.theme='light';}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
