import type { Metadata } from 'next';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import styles from './matches.module.css';

export const metadata: Metadata = {
  title: 'Mis Partidos — cancha.',
};

type MatchStatus = 'open' | 'confirmed' | 'en_curso' | 'jugado' | 'completed' | 'cancelled';
type MatchType = 'open' | 'reservation';

interface MatchRow {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  type: MatchType;
  status: MatchStatus;
  format: string | null;
  price_per_player: number | null;
  total_price: number | null;
  min_players: number | null;
  max_players: number | null;
  enrolled_count: number;
  sport_name: string;
  field_name: string;
}

const STATUS_LABELS: Record<MatchStatus, string> = {
  open: 'Abierto',
  confirmed: 'Confirmado',
  en_curso: 'En curso',
  jugado: 'Jugado',
  completed: 'Jugado',
  cancelled: 'Cancelado',
};

const STATUS_CLASS: Record<MatchStatus, string> = {
  open: styles.badgeOpen,
  confirmed: styles.badgeConfirmed,
  en_curso: styles.badgeEnCurso,
  jugado: styles.badgeJugado,
  completed: styles.badgeJugado,
  cancelled: styles.badgeCancelled,
};

function formatDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('es-EC', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5);
}

export default async function MatchesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  // Fetch owner_profile + plan
  const { data: ownerProfile } = await supabase
    .from('owner_profiles')
    .select('id, plan_id, plans(max_matches_per_month, name)')
    .eq('user_id', user.id)
    .single();

  // Fetch owner's fields via clubs join
  const { data: clubsForOwner } = await supabase
    .from('clubs')
    .select('id')
    .eq('owner_id', user.id);
  const ownerClubIds = (clubsForOwner ?? []).map(c => c.id);

  const { data: fieldsData, error: fieldsError } = ownerClubIds.length > 0
    ? await supabase
        .from('fields')
        .select('id, name')
        .in('club_id', ownerClubIds)
    : { data: [], error: null };



  const fieldIds = (fieldsData ?? []).map((f) => f.id);
  const fieldMap = Object.fromEntries((fieldsData ?? []).map((f) => [f.id, f.name]));

  // Fetch matches for this owner with sport info
  const { data: matchesRaw } = fieldIds.length > 0
    ? await supabase
        .from('matches')
        .select(`
          id, date, start_time, end_time, type, status, format,
          price_per_player, total_price, min_players, max_players,
          field_id,
          sports(name),
          enrollments(id, status)
        `)
        .in('field_id', fieldIds)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false })
    : { data: [], error: null };



  // Count matches this month
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const matchesThisMonth = (matchesRaw ?? []).filter(
    (m) => m.date >= monthStart && m.status !== 'cancelled',
  ).length;

  const plan = ownerProfile?.plans as { max_matches_per_month: number; name: string } | null;
  const maxMatches = plan?.max_matches_per_month ?? 0;
  const planName = plan?.name ?? 'Sin plan';
  const usagePercent = maxMatches > 0 ? Math.min(100, (matchesThisMonth / maxMatches) * 100) : 0;
  const atLimit = plan !== null && matchesThisMonth >= maxMatches;

  // Shape data for render
  const matches: MatchRow[] = (matchesRaw ?? []).map((m) => {
    const sportName = (m.sports as { name: string } | null)?.name ?? '—';
    const enrollments = (m.enrollments as Array<{ id: string; status: string }> | null) ?? [];
    const activeEnrollments = enrollments.filter((e) => e.status !== 'refunded' && e.status !== 'cancelled');
    return {
      id: m.id,
      date: m.date,
      start_time: m.start_time,
      end_time: m.end_time,
      type: m.type as MatchType,
      status: m.status as MatchStatus,
      format: m.format,
      price_per_player: m.price_per_player,
      total_price: m.total_price,
      min_players: m.min_players,
      max_players: m.max_players,
      enrolled_count: activeEnrollments.length,
      sport_name: sportName,
      field_name: fieldMap[m.field_id] ?? '—',
    };
  });

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Gestión</span>
          <h1 className={styles.pageTitle}>Mis Partidos</h1>
        </div>
        <Link
          href="/dashboard/matches/new"
          className={`${styles.newMatchBtn} ${atLimit ? styles.newMatchBtnDisabled : ''}`}
          aria-disabled={atLimit}
          tabIndex={atLimit ? -1 : undefined}
        >
          + Publicar partido
        </Link>
      </header>

      {ownerProfile && (
        <div className={styles.planBanner} role="status" aria-label="Uso del plan">
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
              <span className={styles.planBannerLabel}>
                Plan {planName} — partidos este mes
              </span>
              <span className={styles.planBannerCount}>
                {matchesThisMonth} de {maxMatches}
              </span>
            </div>
            <div className={styles.planBar}>
              <div
                className={`${styles.planBarFill} ${atLimit ? styles.planBarFillFull : ''}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Upgrade nudge — show when at 80%+ of plan limit */}
      {plan !== null && maxMatches > 0 && matchesThisMonth >= Math.floor(maxMatches * 0.8) && (
        <div className={styles.upgradeBanner} role="alert">
          <span className={styles.upgradeBannerText}>
            {atLimit
              ? `Alcanzaste el límite de tu plan ${planName}. Actualiza para seguir publicando.`
              : `Casi sin partidos disponibles en tu plan ${planName}.`}
          </span>
          <a href="/dashboard/plan" className={styles.upgradeLink}>
            Ver planes →
          </a>
        </div>
      )}

      {matches.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon} aria-hidden="true">
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" strokeOpacity="0.3"/>
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" strokeOpacity="0.15"/>
              <circle cx="24" cy="24" r="6" stroke="currentColor" strokeWidth="2"/>
              <line x1="24" y1="4" x2="24" y2="18" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4"/>
              <line x1="24" y1="30" x2="24" y2="44" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4"/>
              <line x1="4" y1="24" x2="18" y2="24" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4"/>
              <line x1="30" y1="24" x2="44" y2="24" stroke="currentColor" strokeWidth="1.5" strokeOpacity="0.4"/>
            </svg>
          </div>
          <p className={styles.emptyTitle}>Sin partidos publicados</p>
          <p className={styles.emptyText}>
            {fieldIds.length === 0
              ? 'No se encontraron canchas asociadas a tu cuenta. Registra una cancha primero.'
              : 'Aún no has publicado ningún partido. Crea tu primer partido para que los jugadores puedan encontrarlo e inscribirse.'}
          </p>
          {fieldIds.length === 0 ? (
            <Link href="/dashboard/fields" className={styles.newMatchBtn}>
              Ir a Mis canchas
            </Link>
          ) : !atLimit && (
            <Link href="/dashboard/matches/new" className={styles.newMatchBtn}>
              + Publicar primer partido
            </Link>
          )}
        </div>
      ) : (
        <ul className={styles.matchList} role="list">
          {matches.map((match) => (
            <li key={match.id} className={styles.matchCard}>
              <Link href={`/dashboard/matches/${match.id}`} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
              <div className={styles.matchMain}>
                <div className={styles.matchTopRow}>
                  <span className={styles.matchTitle}>
                    <span className={styles.sportTag}>{match.sport_name}</span>
                    {match.format ? ` · ${match.format}` : ''}
                  </span>
                  <div className={styles.badgesRow}>
                    <span
                      className={`${styles.badge} ${match.type === 'open' ? styles.badgeTypeOpen : styles.badgeTypeReservation}`}
                    >
                      {match.type === 'open' ? 'Individual' : 'Reserva completa'}
                    </span>
                    <span className={`${styles.badge} ${STATUS_CLASS[match.status]}`}>
                      {STATUS_LABELS[match.status]}
                    </span>
                  </div>
                </div>

                <div className={styles.matchMeta}>
                  <span className={styles.matchMetaItem}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:4}}>
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                      <circle cx="12" cy="10" r="3"/>
                    </svg>
                    {match.field_name}
                  </span>
                  <span className={styles.matchMetaItem}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:4}}>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    {formatDate(match.date)}
                  </span>
                  <span className={styles.matchMetaItem}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:4}}>
                      <circle cx="12" cy="12" r="10"/>
                      <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    {formatTime(match.start_time)} – {formatTime(match.end_time)}
                  </span>
                  {match.type === 'open' && match.max_players != null && (
                    <span className={styles.matchMetaItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:4}}>
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                      </svg>
                      {match.enrolled_count}/{match.max_players} jugadores
                    </span>
                  )}
                  {match.type === 'open' && match.price_per_player != null && (
                    <span className={styles.matchMetaItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:4}}>
                        <line x1="12" y1="1" x2="12" y2="23"/>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                      </svg>
                      ${match.price_per_player} c/u
                    </span>
                  )}
                  {match.type === 'reservation' && match.total_price != null && (
                    <span className={styles.matchMetaItem}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{display:'inline',verticalAlign:'middle',marginRight:4}}>
                        <line x1="12" y1="1" x2="12" y2="23"/>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                      </svg>
                      ${match.total_price} total
                    </span>
                  )}
                </div>
              </div>
              </Link>

              <div className={styles.matchActions}>
                <Link
                  href={`/dashboard/matches/${match.id}`}
                  className={styles.actionLink}
                >
                  Ver inscritos
                </Link>
                {(match.status === 'open' || match.status === 'confirmed') && (
                  <Link
                    href={`/dashboard/matches/${match.id}?cancel=1`}
                    className={`${styles.actionLink} ${styles.actionLinkDanger}`}
                  >
                    Cancelar
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
