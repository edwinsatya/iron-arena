import type { Metadata, Viewport } from 'next';
import '@fontsource/dela-gothic-one/400.css';
import '@fontsource/zen-kaku-gothic-new/500.css';
import '@fontsource/zen-kaku-gothic-new/700.css';
import '@fontsource/zen-kaku-gothic-new/900.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEON FIST — 2D anime brawler',
  description:
    'A 2D pixel-art brawler in your browser. Pick a hero with three skills and an ultimate, then knock your friend off the stage — online with rollback netcode.',
};

export const viewport: Viewport = {
  themeColor: '#15111e',
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
