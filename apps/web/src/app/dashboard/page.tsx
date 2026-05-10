import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import { createClient } from '@/lib/supabase/server';
import styles from '@/app/(dashboard)/dashboard.module.css';

export const metadata: Metadata = {
  title: 'Panel — AppDeportes',
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from('users')
        .select('name')
        .eq('id', user.id)
        .single()
    : { data: null };

  const firstName = profile?.name?.split(' ')[0] ?? 'Propietario';

  return (
    <>
      <header className={styles.pageHeader}>
        <span className={styles.welcomeTag}>Panel de control</span>
        <h1 className={styles.pageTitle}>Hola, {firstName} 👋</h1>
        <p className={styles.pageSubtitle}>
          Aquí tienes el resumen de tu actividad este mes.
        </p>
      </header>

      <section aria-label="Resumen de actividad">
        <ul className={styles.summaryGrid} role="list">
          <li
            className={styles.summaryCard}
            style={{ '--card-accent': 'oklch(68% 0.18 155)' } as CSSProperties}
          >
            <div className={styles.cardLabel}>Tus partidos</div>
            <div className={styles.cardValue}>—</div>
            <div className={styles.cardNote}>Partidos publicados este mes</div>
          </li>

          <li
            className={styles.summaryCard}
            style={{ '--card-accent': 'oklch(65% 0.18 250)' } as CSSProperties}
          >
            <div className={styles.cardLabel}>Jugadores inscritos</div>
            <div className={styles.cardValue}>—</div>
            <div className={styles.cardNote}>Total de inscripciones activas</div>
          </li>

          <li
            className={styles.summaryCard}
            style={{ '--card-accent': 'oklch(75% 0.18 65)' } as CSSProperties}
          >
            <div className={styles.cardLabel}>Canchas activas</div>
            <div className={styles.cardValue}>—</div>
            <div className={styles.cardNote}>Canchas disponibles para reserva</div>
          </li>
        </ul>
      </section>

      <div className={styles.comingSoon} role="status">
        <p className={styles.comingSoonTitle}>Próximamente</p>
        <p className={styles.comingSoonText}>
          El calendario de partidos, gestión de canchas y estadísticas de ingresos
          estarán disponibles en la próxima versión.
        </p>
      </div>
    </>
  );
}
