import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NestBalance',
    short_name: 'NestBalance',
    description: 'Sua vida financeira, finalmente simples.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#F3F5F9',
    theme_color: '#0B1020',
    icons: [
      {
        src: '/nestbalance-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any'
      },
      {
        src: '/nestbalance-icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable'
      }
    ]
  };
}
