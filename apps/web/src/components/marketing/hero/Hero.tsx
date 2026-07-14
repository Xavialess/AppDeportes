'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { SportBackground } from '@/components/SportBackground';
import { loadGsap } from '@/lib/gsap';
import styles from './hero.module.css';

export function Hero() {
  const rootRef = useRef<HTMLElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const taglineRef = useRef<HTMLParagraphElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let mm: { add: (query: string, callback: () => void) => void; revert: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      const gsap = await loadGsap();
      if (cancelled) return;

      mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        tl.set([headlineRef.current, taglineRef.current, ctaRef.current], { opacity: 0, y: 28 })
          .to(headlineRef.current, { opacity: 1, y: 0, duration: 0.7 })
          .to(taglineRef.current, { opacity: 1, y: 0, duration: 0.6 }, '-=0.4')
          .to(ctaRef.current, { opacity: 1, y: 0, duration: 0.6 }, '-=0.35');

        if (bgRef.current) {
          gsap.to(bgRef.current, {
            yPercent: 12,
            ease: 'none',
            scrollTrigger: {
              trigger: root,
              start: 'top top',
              end: 'bottom top',
              scrub: true,
            },
          });
        }
      });

      mm.add('(prefers-reduced-motion: reduce)', () => {
        gsap.set([headlineRef.current, taglineRef.current, ctaRef.current], {
          opacity: 1,
          y: 0,
        });
      });
    })();

    return () => {
      cancelled = true;
      mm?.revert();
    };
  }, []);

  return (
    <section ref={rootRef} className={styles.hero}>
      <div ref={bgRef} className={styles.background}>
        <SportBackground />
      </div>

      <div className={styles.content}>
        <span className={styles.eyebrow}>
          Fútbol · Pádel · Tenis · Básquet · Vóley · Natación
        </span>

        <h1 ref={headlineRef} className={styles.headline}>
          Tu próximo partido
          <br />
          empieza acá<span className={styles.dot}>.</span>
        </h1>

        <p ref={taglineRef} className={styles.tagline}>
          Encuentra partidos abiertos cerca de ti, únete en segundos y juega. O si tienes
          una cancha, publícala y llénala de jugadores.
        </p>

        <div ref={ctaRef} className={styles.ctaRow}>
          <a href="#app" className={styles.ctaPrimary}>
            Soy jugador
          </a>
          <Link href="/signup" className={styles.ctaSecondary}>
            Tengo una cancha
          </Link>
        </div>
      </div>
    </section>
  );
}
