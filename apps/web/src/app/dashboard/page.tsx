import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Calendar, Users, MapPin, Plus } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import styles from '@/app/(dashboard)/dashboard.module.css';

export const metadata: Metadata = {
  title: 'Panel — cancha.',
};

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short' });
}

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

  // Fetch owner's field IDs via clubs
  const { data: clubsOwned } = await supabase
    .from('clubs')
    .select('id')
    .eq('owner_id', user.id);
  const ownedClubIds = (clubsOwned ?? []).map(c => c.id);

  const { data: fieldsData } = ownedClubIds.length > 0
    ? await supabase.from('fields').select('id').in('club_id', ownedClubIds)
    : { data: [] };

  const fieldIds = (fieldsData ?? []).map((f) => f.id);
  const fieldsCount = fieldIds.length;

  // Current month bounds
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
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

  // Active enrollments
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

  // Upcoming open/confirmed matches (next 3)
  const { data: upcomingRaw } = fieldIds.length > 0
    ? await supabase
        .from('matches')
        .select('id, date, start_time, end_time, status, format, max_players, sports(name), fields(name), enrollments(id, status)')
        .in('field_id', fieldIds)
        .in('status', ['open', 'confirmed'])
        .gte('date', today)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true })
        .limit(3)
    : { data: [] };

  type UpcomingMatch = {
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    status: string;
    format: string | null;
    max_players: number | null;
    sportName: string;
    fieldName: string;
    enrolledCount: number;
  };

  const upcoming: UpcomingMatch[] = (upcomingRaw ?? []).map((m) => {
    const enrollments = (m.enrollments as Array<{ id: string; status: string }> | null) ?? [];
    const activeCount = enrollments.filter(e => e.status !== 'cancelled' && e.status !== 'refunded').length;
    return {
      id: m.id,
      date: m.date,
      start_time: m.start_time,
      end_time: m.end_time,
      status: m.status,
      format: m.format,
      max_players: m.max_players,
      sportName: (m.sports as { name: string } | null)?.name ?? '—',
      fieldName: (m.fields as { name: string } | null)?.name ?? '—',
      enrolledCount: activeCount,
    };
  });

  const STATUS_COLOR: Record<string, string> = {
    open: 'var(--color-accent)',
    confirmed: '#60a5fa',
  };

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
        <h1 className={styles.pageTitle}>Hola, {firstName}</h1>
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

      <section aria-labelledby="upcoming-heading" className={styles.upcomingSection}>
        <div className={styles.upcomingHeader}>
          <h2 id="upcoming-heading" className={styles.upcomingTitle}>Próximos partidos</h2>
          <Link href="/dashboard/matches" className={styles.upcomingSeeAll}>
            Ver todos →
          </Link>
        </div>

        {upcoming.length === 0 ? (
          <div className={styles.upcomingEmpty}>
            <div className={styles.upcomingEmptyInner}>
              <Calendar size={20} style={{ color: 'rgba(255,255,255,0.25)', marginBottom: '0.5rem' }} />
              <p className={styles.upcomingEmptyText}>No tienes partidos próximos.</p>
              {fieldsCount > 0 && (
                <Link href="/dashboard/matches/new" className={styles.upcomingPostBtn}>
                  <Plus size={14} />
                  Publicar partido
                </Link>
              )}
            </div>
          </div>
        ) : (
          <ul className={styles.upcomingList} role="list">
            {upcoming.map((m) => (
              <li key={m.id}>
                <Link href={`/dashboard/matches/${m.id}`} className={styles.upcomingCard}>
                  <div
                    className={styles.upcomingAccentBar}
                    style={{ background: STATUS_COLOR[m.status] ?? 'var(--color-accent)' } as CSSProperties}
                  />
                  <div className={styles.upcomingCardBody}>
                    <div className={styles.upcomingSportRow}>
                      <span className={styles.upcomingSportTag}>{m.sportName}</span>
                      {m.format && <span className={styles.upcomingFormat}>{m.format}</span>}
                    </div>
                    <div className={styles.upcomingMeta}>
                      <span className={styles.upcomingMetaItem}>
                        <Calendar size={12} />
                        {formatDate(m.date)}
                      </span>
                      <span className={styles.upcomingMetaItem}>
                        <MapPin size={12} />
                        {m.fieldName}
                      </span>
                      {m.max_players != null && (
                        <span className={styles.upcomingMetaItem}>
                          <Users size={12} />
                          {m.enrolledCount}/{m.max_players}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={styles.upcomingTime}>
                    {m.start_time.slice(0, 5)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
