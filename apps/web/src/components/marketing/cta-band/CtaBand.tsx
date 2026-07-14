'use client';

import Link from 'next/link';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import styles from './cta-band.module.css';

export function CtaBand() {
  const containerRef = useScrollReveal<HTMLDivElement>(`.${styles.reveal}`);

  return (
    <section id="app" ref={containerRef} className={styles.section}>
      <div className={styles.reveal}>
        <h2 className={styles.title}>Pronto en tu bolsillo</h2>
        <p className={styles.subtitle}>
          La app para jugadores llega pronto a Quito y Guayaquil.
        </p>

        <div className={styles.badges}>
          <span className={styles.badge} aria-disabled="true">
            <span className={styles.badgeLabel}>Próximamente en</span>
            <span className={styles.badgeStore}>App Store</span>
          </span>
          <span className={styles.badge} aria-disabled="true">
            <span className={styles.badgeLabel}>Próximamente en</span>
            <span className={styles.badgeStore}>Google Play</span>
          </span>
        </div>

        <p className={styles.contactPrompt}>
          ¿Tienes preguntas?{' '}
          <Link href="/contacto" className={styles.contactLink}>
            Escríbenos
          </Link>
        </p>
      </div>
    </section>
  );
}
