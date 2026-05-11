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
  title: 'cancha. — Panel de gestión',
  description: 'Panel de propietarios y administración para cancha. Ecuador',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={`${spaceGrotesk.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
