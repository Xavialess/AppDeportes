import type { Metadata } from 'next';
import { Hero } from '@/components/marketing/hero/Hero';

export const metadata: Metadata = {
  title: 'cancha. — Encuentra partidos de deportes en Ecuador',
};

export default function HomePage() {
  return (
    <main>
      <Hero />
    </main>
  );
}
