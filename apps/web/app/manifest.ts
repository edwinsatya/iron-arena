import type { MetadataRoute } from 'next';

/** Installed on a phone's home screen: full screen and sideways, like the match itself. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Iron Arena',
    short_name: 'Iron Arena',
    description: 'Fantasy duels in your browser: fourteen pixel-art heroes, online with rollback netcode.',
    start_url: '/',
    display: 'fullscreen',
    orientation: 'landscape',
    background_color: '#13101a',
    theme_color: '#13101a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
