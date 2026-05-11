import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import styles from '@/app/(dashboard)/dashboard.module.css';

export const metadata: Metadata = {
  title: 'Panel — cancha.',
};

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('name')
    .eq('id', user.id)
    .single();

  const firstName = profile?.name?.split(' ')[0] ?? 'Propietario';

  // Fetch owner's field IDs
  const { data: fieldsData } = await supabase
    .from('fields')
    .select('id')
    .eq('owner_id', user.id);

  const fieldIds = (fieldsData ?? []).map((f) => f.id);
  const fieldsCount = fieldIds.length;

  // Current month bounds
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  // Matches this month (non-cancelled)
  const { count: matchesCount } = fieldIds.length > 0
    ? await supabase
        .from('matches')
        .select('*', { count: 'exact', head: true })
        .in('field_id', fieldIds)
        .neq('status', 'cancelled')
        .gte('date', monthStart)
    : { count: 0 };

  // Active enrollments: get match IDs first, then count enrollments
  let enrollmentsCount = 0;
  if (fieldIds.length > 0) {
    const { data: matchRows } = await supabase
      .from('matches')
      .select('id')
      .in('field_id', fieldIds)
      .neq('status', 'cancelled');

    const matchIds = (matchRows ?? []).map((m) => m.id);

    if (matchIds.length > 0) {
      const { count } = await supabase
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .in('match_id', matchIds)
        .not('status', 'in', '("cancelled","refunded")');

      enrollmentsCount = count ?? 0;
    }
  }

  const STATS = [
    {
      label: 'Partidos este mes',
      value: matchesCount ?? 0,
      note: 'Partidos activos publicados',
      accent: 'var(--color-accent)',
      href: '/dashboard/matches',
    },
    {
      label: 'Jugadores inscritos',
      value: enrollmentsCount,
      note: 'Inscripciones activas totales',
      accent: '#60a5fa',
      href: '/dashboard/matches',
    },
    {
      label: 'Canchas activas',
      value: fieldsCount,
      note: 'Canchas registradas en tu cuenta',
      accent: '#34d399',
      href: '/dashboard/fields',
    },
  ];

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
          {STATS.map((stat) => (
            <li key={stat.label}>
              <Link
                href={stat.href}
                className={styles.summaryCard}
                style={{ '--card-accent': stat.accent, display: 'block', textDecoration: 'none' } as CSSProperties}
              >
                <div className={styles.cardLabel}>{stat.label}</div>
                <div className={styles.cardValue}>{stat.value}</div>
                <div className={styles.cardNote}>{stat.note}</div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
