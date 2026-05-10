import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../hooks/useSession';
import { colors, radius, spacing } from '../../lib/theme';

// ---- types ---------------------------------------------------------------

interface Sport {
  id: string;
  name: string;
  icon: string | null;
}

interface Field {
  id: string;
  name: string;
  address: string;
  city_id: string;
}

interface MatchDetail {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  format: string;
  type: 'open' | 'reservation';
  status: 'open' | 'confirmed' | 'completed' | 'cancelled';
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

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return `$${price.toFixed(2)}`;
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

function canEnroll(match: MatchDetail, isEnrolled: boolean): { allowed: boolean; reason: string | null } {
  if (match.status !== 'open') return { allowed: false, reason: 'Este partido ya no está disponible.' };
  if (isEnrolled) return { allowed: false, reason: null };
  if (match.confirmation_deadline) {
    const deadline = new Date(match.confirmation_deadline);
    if (deadline <= new Date()) return { allowed: false, reason: 'El plazo de inscripción ha cerrado.' };
  }
  if (match.max_players != null && match.enrolled_count >= match.max_players) {
    return { allowed: false, reason: 'El partido está lleno.' };
  }
  return { allowed: true, reason: null };
}

// ---- component ------------------------------------------------------------

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadMatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadMatch() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: matchErr } = await supabase
        .from('matches')
        .select('id, date, start_time, end_time, format, type, status, price_per_player, min_players, max_players, confirmation_deadline, sports(id, name, icon), fields(id, name, address, city_id)')
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

      if (user?.id) {
        const { data: enrollRow } = await supabase
          .from('enrollments')
          .select('id')
          .eq('match_id', id)
          .eq('user_id', user.id)
          .in('status', ['pending', 'confirmed'])
          .maybeSingle();
        setIsEnrolled(!!enrollRow);
      }
    } catch {
      setError('No se pudo cargar el partido. Intenta de nuevo.');
    } finally {
      setLoading(false);
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

  const { label: deadlineLabel, expired: deadlineExpired } = formatDeadlineDetail(match.confirmation_deadline);
  const { allowed: enrollAllowed } = canEnroll(match, isEnrolled);

  const isFull = match.max_players != null && match.enrolled_count >= match.max_players;
  const isCancelled = match.status === 'cancelled';

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
            ) : match.status === 'confirmed' ? (
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
          {match.fields?.address ? (
            <InfoRow label="DIRECCIÓN" value={match.fields.address} />
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
      </ScrollView>

      {/* Bottom enroll bar */}
      <View style={styles.bottomBar}>
        {isEnrolled ? (
          <View style={styles.enrolledBadge}>
            <Text style={styles.enrolledBadgeText}>✓ Ya estás inscrito</Text>
          </View>
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
            onPress={() => router.push(`/match/${id}/enroll` as any)}
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: radius.cardLg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.line,
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
