import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Space_Grotesk, Geist_Mono } from 'next/font/google';
import '../styles/globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-display',
  display: 'swap',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'cancha.',
    template: '%s — cancha.',
  },
  description: 'Encuentra y únete a partidos de fútbol y más deportes cerca de ti en Ecuador.',
  keywords: ['fútbol', 'deportes', 'partidos', 'Ecuador', 'canchas', 'Quito', 'Guayaquil'],
  authors: [{ name: 'cancha.' }],
  creator: 'cancha.',
  openGraph: {
    type: 'website',
    locale: 'es_EC',
    url: 'https://cancha.ec',
    siteName: 'cancha.',
    title: 'cancha. — Encuentra partidos de deportes en Ecuador',
    description: 'Encuentra y únete a partidos de fútbol y más deportes cerca de ti en Ecuador.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'cancha. — Deportes en Ecuador',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'cancha. — Encuentra partidos de deportes en Ecuador',
    description: 'Encuentra y únete a partidos de fútbol y más deportes cerca de ti en Ecuador.',
    images: ['/og-image.png'],
  },
  robots: {
    index: true,
    follow: true,
  },
  manifest: '/site.webmanifest',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
