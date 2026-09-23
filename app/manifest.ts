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
    background_color: '#080B14',
    theme_color: '#080B14',
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
    ],
    share_target: {
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [
          {
            name: 'files',
            accept: ['image/*','application/pdf','text/csv','text/plain','audio/*']
          }
        ]
      }
    }
  } as MetadataRoute.Manifest;
}
