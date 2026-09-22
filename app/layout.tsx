import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaRuntime } from '@/src/features/pwa/pwa-runtime';

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
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', colorScheme: 'light dark' };

export default function RootLayout({ children }: Readonly<{children: React.ReactNode}>) {
  return <html lang="pt-BR"><body><PwaRuntime/>{children}</body></html>;
}
