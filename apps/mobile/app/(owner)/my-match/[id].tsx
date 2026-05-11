import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { colors, radius, spacing } from '../../../lib/theme';
import { formatPrice } from '../../../lib/format';

type MatchStatus = 'open' | 'confirmed' | 'completed' | 'cancelled';
type EnrollmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'refunded';

interface MatchDetail {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: MatchStatus;
  type: 'open' | 'reservation';
  is_visible: boolean;
  enrolled_count: number | null;
  max_players: number | null;
  min_players: number | null;
  format: string | null;
  price_per_player: number | null;
  total_price: number | null;
  sports: { name: string } | null;
  fields: { name: string; address: string } | null;
}

interface EnrolledUser {
  id: string;
  name: string | null;
  email: string | null;
}

interface Enrollment {
  id: string;
  status: EnrollmentStatus;
  attended: boolean | null;
  payment_id: string | null;
  users: EnrolledUser | null;
}

const STATUS_LABELS: Record<MatchStatus, string> = {
  open: 'Abierto',
  confirmed: 'Confirmado',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const STATUS_STYLES: Record<MatchStatus, { bg: string; text: string }> = {
  open: { bg: 'rgba(212,255,58,0.1)', text: colors.accent },
  confirmed: { bg: 'rgba(96,165,250,0.1)', text: '#60a5fa' },
  completed: { bg: 'rgba(255,255,255,0.06)', text: colors.mute },
  cancelled: { bg: colors.errorBg, text: colors.error },
};

const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${DAYS_ES[date.getDay()]} ${day} ${MONTHS_ES[month - 1]}`;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function OwnerMatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingEnrollment, setUpdatingEnrollment] = useState<string | null>(null);
  const [completingMatch, setCompletingMatch] = useState(false);
  const [cancellingMatch, setCancellingMatch] = useState(false);
  const [togglingVisibility, setTogglingVisibility] = useState(false);

  useEffect(() => {
    if (!id) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadAll() {
    try {
      const [matchRes, enrollmentsRes] = await Promise.all([
        supabase
          .from('matches')
          .select('id, date, start_time, end_time, status, type, is_visible, max_players, min_players, format, price_per_player, total_price, sports(name), fields(name, address)')
          .eq('id', id)
          .single(),
        supabase
          .from('enrollments')
          .select('id, status, attended, payment_id, users(id, name, email)')
          .eq('match_id', id)
          .not('status', 'in', '(cancelled,refunded)'),
      ]);

      if (matchRes.error) throw matchRes.error;
      if (enrollmentsRes.error) throw enrollmentsRes.error;

      const fetched = enrollmentsRes.data ?? [];
      const matchWithCount = {
        ...(matchRes.data as Omit<MatchDetail, 'enrolled_count'>),
        enrolled_count: fetched.length,
      } as unknown as MatchDetail;

      setMatch(matchWithCount);
      setEnrollments(fetched as Enrollment[]);
      setError(null);
    } catch {
      setError('No se pudo cargar el partido.');
    } finally {
      setLoading(false);
    }
  }

  async function toggleAttendance(enrollment: Enrollment) {
    setUpdatingEnrollment(enrollment.id);
    const newAttended = !enrollment.attended;
    try {
      const { error: updateError } = await supabase
        .from('enrollments')
        .update({ attended: newAttended })
        .eq('id', enrollment.id);

      if (updateError) throw updateError;

      setEnrollments((prev) =>
        prev.map((e) => (e.id === enrollment.id ? { ...e, attended: newAttended } : e))
      );
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la asistencia. Intenta de nuevo.');
    } finally {
      setUpdatingEnrollment(null);
    }
  }

  async function handleCompleteMatch() {
    if (!match) return;

    Alert.alert(
      'Completar partido',
      '¿Confirmas que el partido ha terminado?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'default',
          onPress: async () => {
            setCompletingMatch(true);
            try {
              const { error: updateError } = await supabase
                .from('matches')
                .update({ status: 'completed' })
                .eq('id', match.id);

              if (updateError) throw updateError;

              setMatch((prev) => (prev ? { ...prev, status: 'completed' } : prev));
            } catch {
              Alert.alert('Error', 'No se pudo completar el partido. Intenta de nuevo.');
            } finally {
              setCompletingMatch(false);
            }
          },
        },
      ]
    );
  }

  async function handleCancelMatch() {
    if (!match) return;

    const activeEnrollments = enrollments.filter(
      (e) => e.status === 'pending' || e.status === 'confirmed'
    );
    const playerCount = activeEnrollments.length;

    Alert.alert(
      '¿Cancelar este partido?',
      `Hay ${playerCount} jugador${playerCount !== 1 ? 'es' : ''} inscrito${playerCount !== 1 ? 's' : ''}. Esta acción no se puede deshacer.`,
      [
        { text: 'No, mantener', style: 'cancel' },
        {
          text: 'Sí, cancelar',
          style: 'destructive',
          onPress: async () => {
            setCancellingMatch(true);
            try {
              const { data: { user: currentUser } } = await supabase.auth.getUser();
              const userId = currentUser?.id ?? null;

              const { error: matchError } = await supabase
                .from('matches')
                .update({
                  status: 'cancelled',
                  cancelled_by: userId,
                  cancellation_reason: 'Cancelado por el propietario',
                })
                .eq('id', match.id);

              if (matchError) throw matchError;

              const { error: enrollmentsError } = await supabase
                .from('enrollments')
                .update({ status: 'cancelled' })
                .eq('match_id', match.id)
                .in('status', ['pending', 'confirmed']);

              if (enrollmentsError) throw enrollmentsError;

              // cancellation_count is incremented atomically by the
              // handle_match_owner_cancellation DB trigger — no manual update needed.

              setMatch((prev) => (prev ? { ...prev, status: 'cancelled' } : prev));
              setEnrollments((prev) =>
                prev.map((e) =>
                  e.status === 'pending' || e.status === 'confirmed'
                    ? { ...e, status: 'cancelled' as EnrollmentStatus }
                    : e
                )
              );
            } catch {
              Alert.alert('Error', 'No se pudo cancelar el partido. Intenta de nuevo.');
            } finally {
              setCancellingMatch(false);
            }
          },
        },
      ]
    );
  }

  async function handleToggleVisibility() {
    if (!match) return;

    setTogglingVisibility(true);
    const newVisibility = !match.is_visible;
    try {
      const { error: updateError } = await supabase
        .from('matches')
        .update({ is_visible: newVisibility })
        .eq('id', match.id);

      if (updateError) throw updateError;

      setMatch((prev) => (prev ? { ...prev, is_visible: newVisibility } : prev));
    } catch {
      Alert.alert('Error', 'No se pudo actualizar la visibilidad. Intenta de nuevo.');
    } finally {
      setTogglingVisibility(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (error || !match) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorLarge}>{error ?? 'Partido no encontrado.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadAll}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const statusStyle = STATUS_STYLES[match.status] ?? STATUS_STYLES.open;
  const canMarkAttendance = match.status === 'confirmed' || match.status === 'completed';
  const canComplete = match.status === 'confirmed';
  const canCancel = match.status === 'open' || match.status === 'confirmed';
  const enrolled = match.enrolled_count ?? enrollments.length;
  const max = match.max_players;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backArrow}>
          <Text style={styles.backArrowText}>← Volver</Text>
        </TouchableOpacity>

        {/* Match header card */}
        <View style={styles.matchCard}>
          <View style={styles.matchCardHeader}>
            <View style={styles.matchCardLeft}>
              <Text style={styles.matchSport}>
                {match.sports?.name ?? 'Deporte'}
                {match.format ? ` · ${match.format}` : ''}
              </Text>
              <Text style={styles.matchField}>
                {match.fields?.name ?? ''}
                {match.fields?.address ? ` · ${match.fields.address}` : ''}
              </Text>
              <Text style={styles.matchDate}>
                {formatDate(match.date)} · {match.start_time.slice(0, 5)}–{match.end_time.slice(0, 5)}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {STATUS_LABELS[match.status]}
              </Text>
            </View>
          </View>

          {match.type === 'open' && max != null && (
            <View style={styles.enrollRow}>
              <View style={styles.enrollBarWrap}>
                <View
                  style={[
                    styles.enrollFill,
                    { width: `${Math.min((enrolled / max) * 100, 100)}%` as any },
                  ]}
                />
              </View>
              <Text style={styles.enrollCountText}>{enrolled} / {max}</Text>
            </View>
          )}

          {match.type === 'open' && match.price_per_player != null && (
            <Text style={styles.priceLine}>
              <Text style={styles.priceAmount}>{formatPrice(match.price_per_player)}</Text>
              {' '}por jugador
              {match.min_players != null ? ` · Mín. ${match.min_players}` : ''}
            </Text>
          )}

          {match.type === 'reservation' && match.total_price != null && (
            <Text style={styles.priceLine}>
              Reserva · <Text style={styles.priceAmount}>{formatPrice(match.total_price)}</Text> total
            </Text>
          )}
        </View>

        {/* Complete match CTA */}
        {canComplete && (
          <TouchableOpacity
            style={[styles.completeButton, completingMatch && styles.buttonDisabled]}
            onPress={handleCompleteMatch}
            disabled={completingMatch}
            activeOpacity={0.8}
          >
            {completingMatch ? (
              <ActivityIndicator color={colors.accentFg} />
            ) : (
              <Text style={styles.completeButtonText}>Completar partido</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Actions section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Acciones</Text>
        </View>

        <View style={styles.actionsContainer}>
          {/* Hide / show toggle — works for any match status */}
          <TouchableOpacity
            style={[styles.visibilityButton, togglingVisibility && styles.buttonDisabled]}
            onPress={handleToggleVisibility}
            disabled={togglingVisibility}
            activeOpacity={0.8}
          >
            {togglingVisibility ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={styles.visibilityButtonText}>
                {match.is_visible ? 'Ocultar del listado' : 'Mostrar en listado'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Cancel — only when status is open or confirmed */}
          {canCancel && (
            <TouchableOpacity
              style={[styles.cancelButton, cancellingMatch && styles.buttonDisabled]}
              onPress={handleCancelMatch}
              disabled={cancellingMatch}
              activeOpacity={0.8}
            >
              {cancellingMatch ? (
                <ActivityIndicator color={colors.error} />
              ) : (
                <Text style={styles.cancelButtonText}>Cancelar partido</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {/* Players section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Jugadores{enrollments.length > 0 ? ` · ${enrollments.length}` : ''}
          </Text>
          {canMarkAttendance && (
            <Text style={styles.sectionHint}>Toca ✓ para marcar asistencia</Text>
          )}
        </View>

        {enrollments.length === 0 ? (
          <View style={styles.emptyEnrollments}>
            <Text style={styles.emptyEnrollmentsText}>Aún no hay jugadores inscritos.</Text>
          </View>
        ) : (
          enrollments.map((enrollment) => {
            const playerName = enrollment.users?.name ?? 'Jugador';
            const playerEmail = enrollment.users?.email ?? '';
            const isUpdating = updatingEnrollment === enrollment.id;
            const attended = enrollment.attended === true;
            const isPaid = enrollment.payment_id != null;

            return (
              <View key={enrollment.id} style={styles.playerRow}>
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerAvatarText}>{initials(playerName)}</Text>
                </View>

                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{playerName}</Text>
                  {playerEmail ? <Text style={styles.playerEmail}>{playerEmail}</Text> : null}
                  <View style={styles.playerBadges}>
                    <View style={[styles.badge, isPaid ? styles.badgePaid : styles.badgeCash]}>
                      <Text style={[styles.badgeText, isPaid ? styles.badgeTextPaid : styles.badgeTextCash]}>
                        {isPaid ? 'En app' : 'En persona'}
                      </Text>
                    </View>
                    <View style={styles.enrollmentStatusBadge}>
                      <Text style={styles.enrollmentStatusText}>
                        {ENROLLMENT_STATUS_LABELS[enrollment.status]}
                      </Text>
                    </View>
                  </View>
                </View>

                {canMarkAttendance && (
                  <TouchableOpacity
                    style={[styles.attendanceToggle, attended && styles.attendanceToggleActive]}
                    onPress={() => toggleAttendance(enrollment)}
                    disabled={isUpdating}
                    activeOpacity={0.75}
                  >
                    {isUpdating ? (
                      <ActivityIndicator
                        size="small"
                        color={attended ? colors.accentFg : colors.accent}
                      />
                    ) : (
                      <Text style={[styles.attendanceToggleText, attended && styles.attendanceToggleTextActive]}>
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: 32,
  },
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: 56,
    paddingBottom: 40,
  },
  backArrow: {
    marginBottom: spacing.lg,
  },
  backArrowText: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: '600',
  },
  matchCard: {
    backgroundColor: colors.card,
    borderRadius: radius.cardLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.lg,
  },
  matchCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  matchCardLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  matchSport: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  matchField: {
    fontSize: 13,
    color: colors.mute,
    fontWeight: '500',
    marginBottom: 4,
  },
  matchDate: {
    fontSize: 12,
    color: colors.dim,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.badge,
    alignSelf: 'flex-start',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  enrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  enrollBarWrap: {
    flex: 1,
    height: 4,
    backgroundColor: colors.card2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  enrollFill: {
    height: 4,
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  enrollCountText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.mute,
    minWidth: 40,
    textAlign: 'right',
  },
  priceLine: {
    fontSize: 13,
    color: colors.mute,
    fontWeight: '500',
    marginTop: spacing.xs,
  },
  priceAmount: {
    color: colors.accent,
    fontWeight: '700',
  },
  completeButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  completeButtonText: {
    color: colors.accentFg,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHint: {
    fontSize: 11,
    color: colors.dim,
  },
  emptyEnrollments: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  emptyEnrollmentsText: {
    fontSize: 14,
    color: colors.mute,
  },
  playerRow: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: spacing.sm,
  },
  playerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(212,255,58,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  playerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.accent,
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  playerEmail: {
    fontSize: 12,
    color: colors.dim,
    marginBottom: 6,
  },
  playerBadges: {
    flexDirection: 'row',
    gap: spacing.xs,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.badge,
  },
  badgePaid: {
    backgroundColor: 'rgba(96,165,250,0.1)',
  },
  badgeCash: {
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  badgeTextPaid: {
    color: '#60a5fa',
  },
  badgeTextCash: {
    color: colors.mute,
  },
  enrollmentStatusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.badge,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  enrollmentStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.dim,
    letterSpacing: 0.2,
  },
  attendanceToggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.md,
  },
  attendanceToggleActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  attendanceToggleText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.line2,
  },
  attendanceToggleTextActive: {
    color: colors.accentFg,
  },
  errorLarge: {
    fontSize: 15,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  retryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  retryButtonText: {
    color: colors.accentFg,
    fontWeight: '700',
    fontSize: 14,
  },
  actionsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.xl,
  },
  visibilityButton: {
    backgroundColor: colors.card2,
    borderRadius: radius.card,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.line,
  },
  visibilityButtonText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  cancelButton: {
    backgroundColor: 'rgba(248,113,113,0.08)',
    borderRadius: radius.card,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(248,113,113,0.2)',
  },
  cancelButtonText: {
    color: '#f87171',
    fontSize: 14,
    fontWeight: '700',
  },
});
