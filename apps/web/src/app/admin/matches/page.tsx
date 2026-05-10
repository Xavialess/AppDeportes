import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Partidos — Admin cancha.',
};

type MatchStatus = 'open' | 'confirmed' | 'completed' | 'cancelled';

const STATUS_LABELS: Record<MatchStatus, string> = {
  open: 'Abierto',
  confirmed: 'Confirmado',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const STATUS_CLASS: Record<MatchStatus, string> = {
  open: styles.badgeOpen,
  confirmed: styles.badgeConfirmed,
  completed: styles.badgeCompleted,
  cancelled: styles.badgeCancelled,
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function AdminMatchesPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const { status } = await searchParams;
  const validStatuses: MatchStatus[] = ['open', 'confirmed', 'completed', 'cancelled'];
  const activeStatus = validStatuses.includes(status as MatchStatus) ? (status as MatchStatus) : null;

  const admin = createAdminClient();
  let query = admin
    .from('matches')
    .select(`
      id, date, start_time, type, status, format,
      sports(name),
      fields(name, cities(name))
    `)
    .order('date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(200);

  if (activeStatus) {
    query = query.eq('status', activeStatus);
  }

  const { data: matches } = await query;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Supervisión</span>
          <h1 className={styles.pageTitle}>Partidos</h1>
        </div>
      </header>

      <div className={styles.filterBar}>
        <span className={styles.filterLabel}>Filtrar por estado:</span>
        <form method="get" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <select
            name="status"
            className={styles.formSelect}
            defaultValue={activeStatus ?? ''}
          >
            <option value="">Todos</option>
            {validStatuses.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </select>
          <button type="submit" className={styles.btnPrimary}>Filtrar</button>
        </form>
        {activeStatus && (
          <a href="/admin/matches" className={styles.backLink} style={{ fontSize: 'var(--text-xs)' }}>
            × Limpiar filtro
          </a>
        )}
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Hora</th>
              <th>Deporte</th>
              <th>Cancha</th>
              <th>Ciudad</th>
              <th>Tipo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {(matches ?? []).length === 0 && (
              <tr>
                <td colSpan={7} className={styles.tableEmpty}>
                  {activeStatus ? `Sin partidos con estado "${STATUS_LABELS[activeStatus]}".` : 'Sin partidos registrados.'}
                </td>
              </tr>
            )}
            {(matches ?? []).map((m) => {
              const sportName = (m.sports as { name: string } | null)?.name ?? '—';
              const field = m.fields as { name: string; cities: { name: string } | null } | null;
              const fieldName = field?.name ?? '—';
              const cityName = field?.cities?.name ?? '—';
              const matchStatus = m.status as MatchStatus;
              return (
                <tr key={m.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(m.date)}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--color-text-muted)' }}>
                    {m.start_time?.slice(0, 5) ?? '—'}
                  </td>
                  <td>{sportName}</td>
                  <td>{fieldName}</td>
                  <td>{cityName}</td>
                  <td>
                    <span
                      className={styles.badge}
                      style={{
                        background: m.type === 'open' ? 'rgba(212,255,58,0.1)' : 'oklch(65% 0.18 300 / 0.12)',
                        color: m.type === 'open' ? 'var(--color-accent)' : 'oklch(70% 0.18 300)',
                      }}
                    >
                      {m.type === 'open' ? 'Abierto' : 'Reserva'}
                    </span>
                  </td>
                  <td>
                    <span className={`${styles.badge} ${STATUS_CLASS[matchStatus] ?? ''}`}>
                      {STATUS_LABELS[matchStatus] ?? matchStatus}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
