import type { Metadata, Viewport } from 'next';
import '@fontsource/anton';
import '@fontsource/barlow-semi-condensed/500.css';
import '@fontsource/barlow-semi-condensed/600.css';
import '@fontsource/barlow-semi-condensed/700.css';
import '@fontsource/barlow-semi-condensed/600-italic.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'NEON FIST — rooftop fighting, online with a friend',
  description:
    'A Tekken-style 3D fighting game in your browser. Send a link, pick Kaito or Magnus, and fight your friend in real time with rollback netcode.',
};

export const viewport: Viewport = {
  themeColor: '#15122e',
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
