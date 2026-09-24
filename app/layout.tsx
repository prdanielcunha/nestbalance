import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import './foundation.css';
import './home-premium.css';
import './planning.css';
import './collaboration.css';
import { PwaRuntime } from '@/src/features/pwa/pwa-runtime';
import { ThemeRuntime } from '@/src/features/theme/theme-runtime';
import { ProductMetricsRuntime } from '@/src/features/telemetry/product-metrics-runtime';
import { OfflineMutationRuntime } from '@/src/features/offline/offline-mutation-runtime';
import { ToastViewport } from '@/src/features/feedback/toast-viewport';
import { CrashTelemetryRuntime } from '@/src/features/telemetry/crash-telemetry-runtime';
import { BetaPulseRuntime } from '@/src/features/telemetry/beta-pulse-runtime';

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
  return <html lang="pt-BR" data-theme="dark" className={inter.variable} suppressHydrationWarning>
    <head><script dangerouslySetInnerHTML={{__html:themeBootScript}}/></head>
    <body><PwaRuntime/><ThemeRuntime/><ProductMetricsRuntime/><CrashTelemetryRuntime/><BetaPulseRuntime/><OfflineMutationRuntime/>{children}<ToastViewport/></body>
  </html>;
}
