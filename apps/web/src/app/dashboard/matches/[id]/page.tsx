import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../matches.module.css';

export const metadata: Metadata = { title: 'Detalle del partido — cancha.' };

type MatchStatus = 'open' | 'confirmed' | 'completed' | 'cancelled';
type EnrollmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'refunded';

const STATUS_LABELS: Record<MatchStatus, string> = {
  open: 'Abierto', confirmed: 'Confirmado', completed: 'Completado', cancelled: 'Cancelado',
};
const STATUS_CLASS: Record<MatchStatus, string> = {
  open: styles.badgeOpen, confirmed: styles.badgeConfirmed,
  completed: styles.badgeCompleted, cancelled: styles.badgeCancelled,
};
const ENROLL_LABELS: Record<EnrollmentStatus, string> = {
  pending: 'Pendiente', confirmed: 'Confirmado', cancelled: 'Cancelado', refunded: 'Reembolsado',
};

function fmt(dateStr: string) {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

async function cancelMatch(matchId: string, ownerId: string) {
  'use server';
  const supabase = createAdminClient();
  await supabase
    .from('matches')
    .update({
      status: 'cancelled' as MatchStatus,
      cancellation_reason: 'Cancelado por el propietario',
      cancelled_by: ownerId,
    })
    .eq('id', matchId)
    .in('status', ['open', 'confirmed'] as MatchStatus[]);
  // Mark active enrollments cancelled
  await supabase
    .from('enrollments')
    .update({ status: 'cancelled' as EnrollmentStatus })
    .eq('match_id', matchId)
    .in('status', ['pending', 'confirmed'] as EnrollmentStatus[]);
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cancel?: string }>;
}

export default async function MatchDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { cancel } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Verify ownership
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const { data: matchRaw } = await supabase
    .from('matches')
    .select('id, date, start_time, end_time, type, status, format, price_per_player, total_price, min_players, max_players, field_id, sports(name), fields(name, address, owner_id)')
    .eq('id', id)
    .single();

  if (!matchRaw) notFound();

  const field = matchRaw.fields as { name: string; address: string; owner_id: string } | null;

  // Ensure this owner owns this field (admins may bypass)
  if (profile?.role !== 'admin' && field?.owner_id !== user.id) notFound();

  // Handle cancel action
  if (cancel === '1' && (matchRaw.status === 'open' || matchRaw.status === 'confirmed')) {
    await cancelMatch(id, user.id);
    redirect(`/dashboard/matches/${id}`);
  }

  const { data: enrollmentsRaw } = await supabase
    .from('enrollments')
    .select('id, status, attended, payment_id, users(id, name, email)')
    .eq('match_id', id)
    .order('created_at', { ascending: true });

  const enrollments = (enrollmentsRaw ?? []) as Array<{
    id: string;
    status: EnrollmentStatus;
    attended: boolean | null;
    payment_id: string | null;
    users: { id: string; name: string; email: string } | null;
  }>;

  const activeEnrollments = enrollments.filter(e => e.status !== 'cancelled' && e.status !== 'refunded');
  const match = matchRaw as typeof matchRaw & { status: MatchStatus };
  const sport = matchRaw.sports as { name: string } | null;
  const canCancel = match.status === 'open' || match.status === 'confirmed';

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/dashboard/matches" className={styles.backLink}>← Mis partidos</Link>
          <h1 className={styles.pageTitle}>
            {sport?.name ?? '—'}{match.format ? ` · ${match.format}` : ''}
          </h1>
        </div>
        {canCancel && (
          <Link
            href={`/dashboard/matches/${id}?cancel=1`}
            className={`${styles.actionLink} ${styles.actionLinkDanger}`}
          >
            Cancelar partido
          </Link>
        )}
      </header>

      <div className={styles.detailGrid}>
        <div className={styles.detailCard}>
          <p className={styles.detailRow}><span className={styles.detailLabel}>Cancha</span> {field?.name ?? '—'}</p>
          {field?.address && <p className={styles.detailRow}><span className={styles.detailLabel}>Dirección</span> {field.address}</p>}
          <p className={styles.detailRow}><span className={styles.detailLabel}>Fecha</span> {fmt(match.date)}</p>
          <p className={styles.detailRow}><span className={styles.detailLabel}>Horario</span> {match.start_time.slice(0, 5)} – {match.end_time.slice(0, 5)}</p>
          {match.type === 'open' && match.price_per_player != null && (
            <p className={styles.detailRow}><span className={styles.detailLabel}>Precio/jugador</span> ${match.price_per_player}</p>
          )}
          {match.type === 'reservation' && match.total_price != null && (
            <p className={styles.detailRow}><span className={styles.detailLabel}>Precio total</span> ${match.total_price}</p>
          )}
          {match.min_players != null && (
            <p className={styles.detailRow}><span className={styles.detailLabel}>Mínimo</span> {match.min_players} jugadores</p>
          )}
          {match.max_players != null && (
            <p className={styles.detailRow}><span className={styles.detailLabel}>Máximo</span> {match.max_players} jugadores</p>
          )}
          <p className={styles.detailRow}>
            <span className={styles.detailLabel}>Estado</span>
            <span className={`${styles.badge} ${STATUS_CLASS[match.status]}`}>{STATUS_LABELS[match.status]}</span>
          </p>
        </div>
      </div>

      <section aria-labelledby="enrollments-heading" className={styles.enrollSection}>
        <h2 id="enrollments-heading" className={styles.sectionTitle}>
          Jugadores inscritos
          <span className={styles.enrollCount}>{activeEnrollments.length}{match.max_players != null ? ` / ${match.max_players}` : ''}</span>
        </h2>

        {enrollments.length === 0 ? (
          <p className={styles.emptyText}>Aún no hay jugadores inscritos.</p>
        ) : (
          <ul className={styles.enrollList} role="list">
            {enrollments.map(e => {
              const u = e.users;
              const initials = u?.name
                ? u.name.split(' ').slice(0, 2).map(p => p[0]?.toUpperCase() ?? '').join('')
                : '?';
              return (
                <li key={e.id} className={styles.enrollItem}>
                  <div className={styles.enrollAvatar} aria-hidden="true">{initials}</div>
                  <div className={styles.enrollInfo}>
                    <span className={styles.enrollName}>{u?.name ?? '—'}</span>
                    <span className={styles.enrollEmail}>{u?.email ?? ''}</span>
                  </div>
                  <div className={styles.enrollMeta}>
                    <span className={`${styles.badge} ${e.status === 'confirmed' ? styles.badgeConfirmed : e.status === 'cancelled' || e.status === 'refunded' ? styles.badgeCancelled : styles.badgeOpen}`}>
                      {ENROLL_LABELS[e.status]}
                    </span>
                    {e.payment_id ? (
                      <span className={styles.payBadge}>En app</span>
                    ) : (
                      <span className={styles.payBadgePerson}>En persona</span>
                    )}
                    {(match.status === 'confirmed' || match.status === 'completed') && (
                      <span className={e.attended ? styles.attendedYes : styles.attendedNo}>
                        {e.attended ? '✓ Asistió' : '— No marcado'}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
}
