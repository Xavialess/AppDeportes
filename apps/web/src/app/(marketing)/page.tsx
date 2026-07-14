import type { Metadata } from 'next';
import { Hero } from '@/components/marketing/hero/Hero';
import { HowItWorks } from '@/components/marketing/how-it-works/HowItWorks';
import { OwnerSpotlight } from '@/components/marketing/owner-spotlight/OwnerSpotlight';
import { CtaBand } from '@/components/marketing/cta-band/CtaBand';

export const metadata: Metadata = {
  title: 'cancha. — Encuentra partidos de deportes en Ecuador',
};

export default function HomePage() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <OwnerSpotlight />
      <CtaBand />
    </main>
  );
}
