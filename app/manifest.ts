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
    background_color: '#080B14',
    theme_color: '#080B14',
    share_target: {
      action: '/share-target',
      method: 'POST',
      enctype: 'multipart/form-data',
      params: {
        title: 'title',
        text: 'text',
        url: 'url',
        files: [{
          name: 'files',
          accept: ['image/*','application/pdf','text/csv','text/plain']
        }]
      }
    },
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
  return value;
}
