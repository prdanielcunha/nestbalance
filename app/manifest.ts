import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  const value: MetadataRoute.Manifest & {share_target:{action:string;method:'POST';enctype:'multipart/form-data';params:{title:string;text:string;url:string;files:Array<{name:string;accept:string[]}>}}} = {
    name: 'NestBalance',
    short_name: 'NestBalance',
    description: 'Sua vida financeira, finalmente simples.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#090B10',
    theme_color: '#090B10',
    share_target: {
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [{ name: 'files', accept: ['image/*','application/pdf','text/csv','text/plain'] }]
      }
    },
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
  return value;
}
