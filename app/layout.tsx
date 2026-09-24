import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import './home-premium.css';
import '../design-system/nestbalance-tokens.css';
import './nestbalance-brand.css';
import { PwaRuntime } from '@/src/features/pwa/pwa-runtime';
import { ThemeRuntime } from '@/src/features/theme/theme-runtime';

const inter=Inter({
  subsets:['latin'],
  display:'swap',
  variable:'--font-inter',
  fallback:['system-ui','Arial'],
  adjustFontFallback:true
});

export const metadata: Metadata = {
  title: 'NestBalance',
  description: 'Sua vida financeira, finalmente simples.',
  applicationName: 'NestBalance',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16.png', sizes: '16x16', type: 'image/png' }
    ],
    shortcut: '/favicon.ico',
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }]
  },
  appleWebApp: {
    capable: true,
    title: 'NestBalance',
    statusBarStyle: 'black-translucent'
  },
  openGraph: {
    title: 'NestBalance',
    description: 'Sua vida financeira, finalmente simples.',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'NestBalance' }]
  },
  other: {
    'msapplication-TileColor': '#090B10',
    'msapplication-config': '/browserconfig.xml'
  }
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', colorScheme: 'dark light', themeColor:'#090B10' };

const themeBootScript=`(()=>{try{const saved=localStorage.getItem('nestbalance-theme');const theme=saved==='light'?'light':'dark';const root=document.documentElement;root.dataset.theme=theme;root.style.colorScheme=theme;}catch{document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';}})();`;

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="pt-BR" data-theme="dark" className={inter.variable} suppressHydrationWarning>
    <head>
      <script dangerouslySetInnerHTML={{__html:themeBootScript}}/>
      <link rel="apple-touch-startup-image" href="/splash/splash-iphone-1290x2796.png" media="(max-width: 767px) and (orientation: portrait)"/>
      <link rel="apple-touch-startup-image" href="/splash/splash-tablet-2048x2732.png" media="(min-width: 768px) and (orientation: portrait)"/>
      <link rel="apple-touch-startup-image" href="/splash/splash-tablet-landscape-2732x2048.png" media="(min-width: 768px) and (orientation: landscape)"/>
    </head>
    <body><PwaRuntime/><ThemeRuntime/>{children}</body>
  </html>;
}
