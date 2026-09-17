import type { Metadata, Viewport } from 'next';
import './dissent-v2.css';
import './dissent-v2-polish.css';
import { DissentProvider } from '@/components/dissent/DissentProvider';
import { Web3Provider } from '@/components/dissent/Web3Provider';

export const metadata: Metadata = {
  title: 'Dissent | Adversarial review for autonomous agents',
  description: 'A live adversarial review market for autonomous agent decisions.',
  manifest: '/site.webmanifest',
  icons: {
    icon: [
      { url: '/icon.png', sizes: '512x512', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '512x512', type: 'image/png' },
    ],
  },
};

export const viewport: Viewport = { themeColor: '#0a0a0a' };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='en' data-scroll-behavior='smooth'>
      <body><Web3Provider><DissentProvider>{children}</DissentProvider></Web3Provider></body>
    </html>
  );
}
