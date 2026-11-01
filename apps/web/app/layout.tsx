import type { Metadata, Viewport } from 'next';
import '@fontsource/grenze/600.css';
import '@fontsource/grenze/700.css';
import '@fontsource/grenze/800.css';
import '@fontsource/grenze/900.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/alegreya-sans/800.css';
import '@fontsource/shippori-mincho-b1/800.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Iron Arena — fantasy duels in your browser',
  description:
    'A fantasy brawler in your browser. Pick one of twelve pixel-art heroes, each with three skills and an ultimate, and duel a friend online with rollback netcode.',
};

export const viewport: Viewport = {
  themeColor: '#13101a',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
