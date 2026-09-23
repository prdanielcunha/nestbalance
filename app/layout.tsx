import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { PwaRuntime } from '@/src/features/pwa/pwa-runtime';
import { ThemeRuntime } from '@/src/features/theme/theme-runtime';

const inter=Inter({subsets:['latin'],display:'swap',variable:'--font-inter'});

export const metadata: Metadata = {
  title: 'NestBalance',
  description: 'Sua vida financeira, finalmente simples.',
  applicationName: 'NestBalance',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/nestbalance-icon.svg',
    shortcut: '/nestbalance-icon.svg'
  },
  appleWebApp: {
    capable: true,
    title: 'NestBalance',
    statusBarStyle: 'black-translucent'
  }
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', colorScheme: 'dark light', themeColor:'#080B14' };

const themeBootScript=`(()=>{try{const saved=localStorage.getItem('nestbalance-theme');const theme=saved==='light'?'light':'dark';const root=document.documentElement;root.dataset.theme=theme;root.style.colorScheme=theme;}catch{document.documentElement.dataset.theme='dark';document.documentElement.style.colorScheme='dark';}})();`;

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{__html:themeBootScript}}/></head>
    <body className={inter.variable}><PwaRuntime/><ThemeRuntime/>{children}</body>
  </html>;
}
