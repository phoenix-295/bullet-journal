export default function manifest() {
  return {
    name: 'Bullet Journal',
    short_name: 'Bullet Journal',
    description: 'Your personal analog-inspired digital bullet journal',
    start_url: '/',
    display: 'standalone',
    background_color: '#1a1a1a',
    theme_color: '#1a1a1a',
    icons: [
      {
        src: '/icon.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any maskable',
      },
    ],
  };
}
