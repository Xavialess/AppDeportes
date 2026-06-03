import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../hooks/useSession';
import { colors, radius, spacing } from '../../lib/theme';
import { formatPrice } from '../../lib/format';

// ---- types ---------------------------------------------------------------

interface Sport {
  id: string;
  name: string;
  icon: string | null;
}

interface Field {
  id: string;
  name: string;
  city_id: string;
  clubs: { name: string; address: string } | null;
}

interface MatchDetail {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  format: string;
  type: 'open' | 'reservation';
  status: 'open' | 'confirmed' | 'en_curso' | 'jugado' | 'completed' | 'cancelled';
  price_per_player: number | null;
  min_players: number | null;
  max_players: number | null;
  confirmation_deadline: string | null;
  enrolled_count: number;
  sports: Sport | null;
  fields: Field | null;
}

// ---- helpers --------------------------------------------------------------

const DAYS_ES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function formatFullDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${DAYS_ES[date.getDay()]}, ${day} de ${MONTHS_ES[month - 1]} de ${year}`;
}

function formatTime(timeStr: string): string {
  return timeStr.slice(0, 5);
}

type EffectiveStatus = MatchDetail['status'];

/**
 * Computes the match state the player should see RIGHT NOW based on wall-clock
 * time, without waiting for the cron to update the DB (up to 1 min lag).
 *
 * Rules:
 *   - Terminal states (cancelled, jugado, completed) are never overridden.
 *   - If end_time has passed → jugado
 *   - If start_time has passed and match is confirmed → en_curso
 *   - Otherwise return the DB status as-is.
 */
function getEffectiveStatus(match: MatchDetail): EffectiveStatus {
  if (match.status === 'cancelled' || match.status === 'jugado' || match.status === 'completed') {
    return match.status;
  }
  const now = new Date();
  const kickoff = new Date(`${match.date}T${match.start_time}`);
  const end     = match.end_time ? new Date(`${match.date}T${match.end_time}`) : null;

  if (end && now >= end) return 'jugado';
  if (now >= kickoff && match.status === 'confirmed') return 'en_curso';
  return match.status;
}

function formatDeadlineDetail(deadlineStr: string | null): { label: string; expired: boolean } {
  if (!deadlineStr) return { label: 'Sin fecha límite', expired: false };
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) return { label: 'Inscripción cerrada', expired: true };
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffHours >= 24) {
    const diffDays = Math.floor(diffHours / 24);
    return { label: `Cierra en ${diffDays} día${diffDays > 1 ? 's' : ''}`, expired: false };
  }
  if (diffHours > 0) return { label: `Cierra en ${diffHours}h ${diffMins}min`, expired: false };
  return { label: `Cierra en ${diffMins} minutos`, expired: false };
}

const ENROLLABLE_STATUSES = ['open', 'confirmed', 'en_curso'] as const;

function canEnroll(match: MatchDetail, isEnrolled: boolean): { allowed: boolean; reason: string | null } {
  if (!ENROLLABLE_STATUSES.includes(match.status as typeof ENROLLABLE_STATUSES[number])) {
    return { allowed: false, reason: 'Este partido ya no acepta inscripciones.' };
  }
  // If the match hasn't transitioned to en_curso yet but kickoff already passed,
  // block enrollment — the auto-cancel cron may not have run yet (up to 5 min lag).
  if (match.status !== 'en_curso') {
    const kickoff = new Date(`${match.date}T${match.start_time}`);
    if (kickoff <= new Date()) {
      return { allowed: false, reason: 'Este partido ya comenzó.' };
    }
  }
  if (isEnrolled) return { allowed: false, reason: null };
  if (match.max_players != null && match.enrolled_count >= match.max_players) {
    return { allowed: false, reason: 'El partido está lleno.' };
  }
  // Deadline only blocks new enrollments when match is still open (not yet confirmed/in-progress)
  if (match.status === 'open' && match.confirmation_deadline) {
    const deadline = new Date(match.confirmation_deadline);
    if (deadline <= new Date()) return { allowed: false, reason: 'El plazo de inscripción ha cerrado.' };
  }
  return { allowed: true, reason: null };
}

// ---- component ------------------------------------------------------------

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [enrollmentId, setEnrollmentId] = useState<string | null>(null);
  const [players, setPlayers] = useState<{ id: string; name: string | null }[]>([]);
  const [withdrawing, setWithdrawing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user?.id]);

  async function loadMatch() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: matchErr } = await supabase
        .from('matches')
        .select('id, date, start_time, end_time, format, type, status, price_per_player, min_players, max_players, confirmation_deadline, sports(id, name, icon), fields(id, name, city_id, clubs(name, address))')
        .eq('id', id)
        .single();

      if (matchErr || !data) throw matchErr ?? new Error('Partido no encontrado');

      const raw = data as unknown as Omit<MatchDetail, 'enrolled_count'>;

      const { count: enrollCount, error: countErr } = await supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', id)
        .in('status', ['pending', 'confirmed']);

      if (countErr) throw countErr;

      const fullMatch: MatchDetail = { ...raw, enrolled_count: enrollCount ?? 0 };
      setMatch(fullMatch);

      // Fetch hero image from storage
      if (raw.fields?.id) {
        try {
          const { data: files } = await supabase.storage
            .from('field-images')
            .list(raw.fields.id);
          if (files && files.length > 0) {
            const { data: urlData } = supabase.storage
              .from('field-images')
              .getPublicUrl(`${raw.fields.id}/${files[0].name}`);
            setHeroUrl(urlData?.publicUrl ?? null);
          }
        } catch {
          // non-fatal: hero image is optional
        }
      }

      if (user?.id) {
        const { data: enrollRow } = await supabase
          .from('enrollments')
          .select('id')
          .eq('match_id', id)
          .eq('user_id', user.id)
          .in('status', ['pending', 'confirmed'])
          .maybeSingle();
        setIsEnrolled(!!enrollRow);
        setEnrollmentId(enrollRow?.id ?? null);
      }

      // Fetch enrolled players (visible after RLS migration 21)
      const { data: enrollmentsData } = await supabase
        .from('enrollments')
        .select('user_id, users(id, name)')
        .eq('match_id', id)
        .in('status', ['pending', 'confirmed']);

      setPlayers(
        (enrollmentsData ?? []).map((e: any) => ({
          id: e.user_id,
          name: e.users?.name ?? null,
        }))
      );
    } catch {
      setError('No se pudo cargar el partido. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  function confirmWithdraw() {
    Alert.alert(
      'Retirarte del partido',
      '¿Seguro que quieres retirarte? Tu lugar quedará libre para otro jugador.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sí, retirarme', style: 'destructive', onPress: handleWithdraw },
      ],
    );
  }

  async function handleWithdraw() {
    if (!enrollmentId) return;
    setWithdrawing(true);
    try {
      const { error: err } = await supabase
        .from('enrollments')
        .update({ status: 'cancelled' })
        .eq('id', enrollmentId)
        .eq('user_id', user!.id);

      if (err) throw err;

      // Stub: reimbursement will be processed by the payment provider
      // TODO: trigger refund via payment Edge Function when payments are live

      setIsEnrolled(false);
      setEnrollmentId(null);
      setMatch((prev) =>
        prev ? { ...prev, enrolled_count: Math.max(0, prev.enrolled_count - 1) } : prev,
      );
      setPlayers((prev) => prev.filter((p) => p.id !== user?.id));

      Alert.alert(
        'Retiro confirmado',
        'Te has retirado del partido. Si realizaste un pago, será reembolsado a la brevedad.',
        [{ text: 'OK' }],
      );
    } catch {
      Alert.alert('Error', 'No se pudo procesar el retiro. Intenta de nuevo.');
    } finally {
      setWithdrawing(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Partido', headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }} />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error || !match) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Partido', headerStyle: { backgroundColor: colors.bg }, headerTintColor: colors.text }} />
        <Text style={styles.errorText}>{error ?? 'Partido no encontrado.'}</Text>
        <TouchableOpacity onPress={loadMatch} style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sportLabel = match.sports
    ? `${match.sports.name}${match.format ? ' · ' + match.format : ''}`
    : match.format ?? 'Partido';

  const effectiveStatus = getEffectiveStatus(match);

  const { label: deadlineLabel, expired: deadlineExpired } = formatDeadlineDetail(match.confirmation_deadline);
  const { allowed: enrollAllowed } = canEnroll({ ...match, status: effectiveStatus }, isEnrolled);

  const isFull = match.max_players != null && match.enrolled_count >= match.max_players;
  const isCancelled = effectiveStatus === 'cancelled';
  const isPast = effectiveStatus === 'jugado' || effectiveStatus === 'completed';
  const isInProgress = effectiveStatus === 'en_curso';
  const canWithdraw = isEnrolled && (effectiveStatus === 'open' || effectiveStatus === 'confirmed');

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          title: sportLabel,
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }}
      />

      {/* Hero image / gradient placeholder */}
      <View style={styles.heroContainer}>
        {heroUrl ? (
          <Image
            source={{ uri: heroUrl }}
            style={styles.heroImage}
            resizeMode="cover"
          />
        ) : (
          <LinearGradient
            colors={['#1a1a1a', '#0d1a00']}
            style={styles.heroImage}
          />
        )}
        {match.sports && (
          <View style={styles.heroBadge}>
            <Text style={styles.heroBadgeText}>
              {match.sports.icon ? `${match.sports.icon} ` : ''}{match.sports.name}
            </Text>
          </View>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header card */}
        <View style={styles.headerCard}>
          <Text style={styles.sportTitle}>{sportLabel}</Text>
          <View style={styles.statusRow}>
            {isCancelled ? (
              <View style={[styles.badge, styles.badgeCancelled]}>
                <Text style={[styles.badgeText, styles.badgeTextCancelled]}>Cancelado</Text>
              </View>
            ) : isPast ? (
              <View style={[styles.badge, styles.badgePast]}>
                <Text style={[styles.badgeText, styles.badgeTextPast]}>Jugado</Text>
              </View>
            ) : isInProgress ? (
              <View style={[styles.badge, styles.badgeInProgress]}>
                <Text style={[styles.badgeText, styles.badgeTextInProgress]}>En curso</Text>
              </View>
            ) : effectiveStatus === 'confirmed' ? (
              <View style={[styles.badge, styles.badgeConfirmed]}>
                <Text style={[styles.badgeText, styles.badgeTextConfirmed]}>Confirmado</Text>
              </View>
            ) : (
              <View style={[styles.badge, styles.badgeOpen]}>
                <Text style={[styles.badgeText, styles.badgeTextOpen]}>Abierto</Text>
              </View>
            )}
          </View>
        </View>

        {/* Info rows */}
        <View style={styles.infoCard}>
          <InfoRow label="CANCHA" value={match.fields?.name ?? '—'} />
          {match.fields?.clubs?.address ? (
            <InfoRow label="DIRECCIÓN" value={match.fields.clubs.address} />
          ) : null}
          <Divider />
          <InfoRow label="FECHA" value={formatFullDate(match.date)} />
          <InfoRow
            label="HORARIO"
            value={`${formatTime(match.start_time)} – ${formatTime(match.end_time)}`}
          />
          <Divider />
          <InfoRow label="PRECIO POR JUGADOR" value={formatPrice(match.price_per_player)} highlight />
          <Divider />
          <InfoRow
            label="JUGADORES"
            value={`${match.enrolled_count}${match.max_players != null ? ` / ${match.max_players}` : ''}`}
          />
          {match.max_players != null && (
            <View style={styles.progressTrackOuter}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min(100, (match.enrolled_count / match.max_players) * 100)}%` as any },
                ]}
              />
            </View>
          )}
          {match.min_players != null ? (
            <View style={styles.minPlayersNote}>
              <Text style={styles.minPlayersText}>
                Mínimo {match.min_players} jugadores requeridos para que el partido se confirme
              </Text>
            </View>
          ) : null}
          <Divider />
          <InfoRow
            label="INSCRIPCIÓN"
            value={deadlineLabel}
            valueStyle={deadlineExpired ? styles.valueExpired : undefined}
          />
        </View>

        {/* Enrolled players */}
        {players.length > 0 && (
          <View style={styles.playersSection}>
            <Text style={styles.playersSectionTitle}>
              Jugadores inscritos · {players.length}
            </Text>
            <View style={styles.playersList}>
              {players.map((p) => {
                const initials = p.name
                  ? p.name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
                  : '?';
                const firstName = p.name?.split(' ')[0] ?? 'Jugador';
                return (
                  <View key={p.id} style={styles.playerItem}>
                    <View style={[styles.playerAvatar, p.id === user?.id && styles.playerAvatarSelf]}>
                      <Text style={styles.playerAvatarText}>{initials}</Text>
                    </View>
                    <Text style={styles.playerName} numberOfLines={1}>
                      {firstName}{p.id === user?.id ? ' (tú)' : ''}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom bar */}
      <View style={styles.bottomBar}>
        {isPast ? (
          // Past match — view only regardless of enrollment
          <View style={[styles.ctaButton, styles.ctaDisabled]}>
            <Text style={styles.ctaButtonText}>
              {isEnrolled ? '✓ Participaste en este partido' : 'Partido finalizado'}
            </Text>
          </View>
        ) : isEnrolled ? (
          // Enrolled in a future/active match
          <>
            <View style={styles.enrolledBadge}>
              <Text style={styles.enrolledBadgeText}>✓ Ya estás inscrito</Text>
            </View>
            {canWithdraw && (
              <TouchableOpacity
                onPress={confirmWithdraw}
                activeOpacity={0.7}
                disabled={withdrawing}
              >
                <Text style={[styles.withdrawLink, withdrawing && { opacity: 0.5 }]}>
                  {withdrawing ? 'Procesando…' : 'Retirarme del partido'}
                </Text>
              </TouchableOpacity>
            )}
          </>
        ) : isFull ? (
          <View style={[styles.ctaButton, styles.ctaDisabled]}>
            <Text style={styles.ctaButtonText}>Lleno</Text>
          </View>
        ) : isCancelled ? (
          <View style={[styles.ctaButton, styles.ctaDisabled]}>
            <Text style={styles.ctaButtonText}>Partido cancelado</Text>
          </View>
        ) : !enrollAllowed ? (
          <View style={[styles.ctaButton, styles.ctaDisabled]}>
            <Text style={styles.ctaButtonText}>Inscripción cerrada</Text>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.ctaButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push(`/match/${id}/enroll` as any);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.ctaButtonText}>
              Inscribirme · {formatPrice(match.price_per_player)}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ---- sub-components -------------------------------------------------------

interface InfoRowProps {
  label: string;
  value: string;
  highlight?: boolean;
  valueStyle?: object;
}

function InfoRow({ label, value, highlight, valueStyle }: InfoRowProps) {
  return (
    <View style={infoRowStyles.row}>
      <Text style={infoRowStyles.label}>{label}</Text>
      <Text style={[infoRowStyles.value, highlight && infoRowStyles.valueHighlight, valueStyle]}>
        {value}
      </Text>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 2 }} />;
}

const infoRowStyles = StyleSheet.create({
  row: {
    paddingVertical: 10,
    gap: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.dim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  value: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '500',
  },
  valueHighlight: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: -0.4,
  },
});

// ---- styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xxl,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  heroContainer: {
    width: '100%',
    height: 220,
    position: 'relative',
  },
  heroImage: {
    width: '100%',
    height: 220,
  },
  heroBadge: {
    position: 'absolute',
    bottom: spacing.md,
    left: spacing.md,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.badge,
  },
  heroBadgeText: {
    color: colors.accentFg,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  headerCard: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.md,
  },
  sportTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
  },
  statusRow: {
    flexDirection: 'row',
  },
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radius.badge,
    alignSelf: 'flex-start',
  },
  badgeOpen: {
    backgroundColor: 'rgba(212,255,58,0.1)',
  },
  badgeConfirmed: {
    backgroundColor: 'rgba(96,165,250,0.1)',
  },
  badgeCancelled: {
    backgroundColor: colors.errorBg,
  },
  badgeInProgress: {
    backgroundColor: 'rgba(251,146,60,0.12)',
  },
  badgePast: {
    backgroundColor: 'rgba(148,163,184,0.12)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  badgeTextOpen: {
    color: colors.accent,
  },
  badgeTextConfirmed: {
    color: '#60a5fa',
  },
  badgeTextCancelled: {
    color: colors.error,
  },
  badgeTextInProgress: {
    color: '#fb923c',
  },
  badgeTextPast: {
    color: '#94a3b8',
  },
  infoCard: {
    backgroundColor: colors.card,
    borderRadius: radius.cardLg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.line,
  },
  progressTrackOuter: {
    height: 4,
    backgroundColor: colors.card2,
    borderRadius: radius.pill,
    overflow: 'hidden',
    marginTop: 6,
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  minPlayersNote: {
    backgroundColor: 'rgba(212,255,58,0.05)',
    borderRadius: radius.badge,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(212,255,58,0.15)',
  },
  minPlayersText: {
    fontSize: 12,
    color: colors.mute,
    lineHeight: 16,
  },
  valueExpired: {
    color: colors.error,
  },
  bottomBar: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 34,
    paddingTop: spacing.md,
    backgroundColor: colors.bg2,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  ctaButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: {
    backgroundColor: colors.card2,
  },
  ctaButtonText: {
    color: colors.accentFg,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  enrolledBadge: {
    backgroundColor: 'rgba(212,255,58,0.1)',
    borderRadius: radius.card,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212,255,58,0.2)',
  },
  enrolledBadgeText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
  },
  enrolledLink: {
    fontSize: 13,
    color: colors.dim,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  withdrawLink: {
    fontSize: 13,
    color: colors.error,
    textAlign: 'center',
    marginTop: spacing.sm,
    fontWeight: '600',
  },
  playersSection: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.xl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  playersSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.mute,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.md,
  },
  playersList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  playerItem: {
    alignItems: 'center',
    gap: 6,
    width: 56,
  },
  playerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(96,165,250,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerAvatarSelf: {
    backgroundColor: 'rgba(212,255,58,0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(212,255,58,0.4)',
  },
  playerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  playerName: {
    fontSize: 11,
    color: colors.mute,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderRadius: radius.badge,
  },
  retryText: {
    color: colors.accentFg,
    fontSize: 14,
    fontWeight: '700',
  },
});
