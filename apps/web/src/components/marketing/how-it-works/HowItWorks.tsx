'use client';

import { useScrollReveal } from '@/hooks/useScrollReveal';
import styles from './how-it-works.module.css';

const STEPS = [
  {
    number: '01',
    title: 'Busca un partido',
    description:
      'Filtra por deporte, ciudad y horario para encontrar partidos abiertos cerca de ti.',
  },
  {
    number: '02',
    title: 'Únete en segundos',
    description:
      'Confirma tu cupo — en persona o pagando desde la app. Sin llamadas, sin grupos de WhatsApp.',
  },
  {
    number: '03',
    title: 'Juega',
    description: 'Preséntate a la hora acordada y disfruta tu partido. Así de simple.',
  },
];

export function HowItWorks() {
  const containerRef = useScrollReveal<HTMLDivElement>(`.${styles.step}`);

  return (
    <section id="como-funciona" className={styles.section}>
      <div className={styles.header}>
        <span className={styles.eyebrow}>Cómo funciona</span>
        <h2 className={styles.title}>De la búsqueda a la cancha en tres pasos</h2>
      </div>

      <div ref={containerRef} className={styles.steps}>
        {STEPS.map((step) => (
          <article key={step.number} className={styles.step}>
            <span className={styles.stepNumber}>{step.number}</span>
            <h3 className={styles.stepTitle}>{step.title}</h3>
            <p className={styles.stepDescription}>{step.description}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
