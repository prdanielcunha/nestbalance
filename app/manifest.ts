import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NestBalance',
    short_name: 'NestBalance',
    description: 'Sua vida financeira, finalmente simples.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F6F7F9',
    theme_color: '#0B1020'
  };
}
