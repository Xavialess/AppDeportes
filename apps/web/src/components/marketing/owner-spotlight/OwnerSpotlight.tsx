'use client';

import Link from 'next/link';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import styles from './owner-spotlight.module.css';

const PLANS = [
  { name: 'Básico', price: '$19.99', matches: '10 partidos/mes' },
  { name: 'Estándar', price: '$39.99', matches: '30 partidos/mes' },
  { name: 'Pro', price: '$69.99', matches: '100 partidos/mes' },
];

export function OwnerSpotlight() {
  const containerRef = useScrollReveal<HTMLDivElement>(`.${styles.planCard}`);

  return (
    <section id="propietarios" className={styles.section}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Para propietarios</span>
        <h2 className={styles.title}>Llena tu cancha, sin comisiones por partido</h2>
        <p className={styles.description}>
          Publica tus canchas, gestiona reservas y controla asistencia desde un solo
          panel. Te quedas con el 100% de lo que cobras a tus jugadores.
        </p>
      </div>

      <div ref={containerRef} className={styles.plans}>
        {PLANS.map((plan) => (
          <article key={plan.name} className={styles.planCard}>
            <h3 className={styles.planName}>{plan.name}</h3>
            <p className={styles.planPrice}>
              {plan.price}
              <span className={styles.planPeriod}>/mes</span>
            </p>
            <p className={styles.planMatches}>{plan.matches}</p>
          </article>
        ))}
      </div>

      <Link href="/signup" className={styles.cta}>
        Regístrate como propietario
      </Link>
    </section>
  );
}
