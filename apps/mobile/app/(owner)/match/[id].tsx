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

type MatchStatus = 'open' | 'confirmed' | 'completed' | 'cancelled';
type EnrollmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'refunded';

interface MatchDetail {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: MatchStatus;
  type: 'open' | 'reservation';
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

const STATUS_COLORS: Record<MatchStatus, { bg: string; text: string }> = {
  open: { bg: '#dcfce7', text: '#15803d' },
  confirmed: { bg: '#dbeafe', text: '#1d4ed8' },
  completed: { bg: '#f3f4f6', text: '#374151' },
  cancelled: { bg: '#fee2e2', text: '#b91c1c' },
};

const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
};

function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function initials(name: string | null | undefined): string {
  if (!name) return '?';
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

export default function MatchDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [match, setMatch] = useState<MatchDetail | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatingEnrollment, setUpdatingEnrollment] = useState<string | null>(null);
  const [completingMatch, setCompletingMatch] = useState(false);

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
          .select(
            'id, date, start_time, end_time, status, type, max_players, min_players, format, price_per_player, total_price, sports(name), fields(name, address)'
          )
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
      } as MatchDetail;

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
        prev.map((e) =>
          e.id === enrollment.id ? { ...e, attended: newAttended } : e
        )
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
      '¿Confirmas que el partido ha terminado? Podrás marcar la asistencia de los jugadores.',
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

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
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

  const statusColor = STATUS_COLORS[match.status] ?? STATUS_COLORS.open;
  const canMarkAttendance =
    match.status === 'confirmed' || match.status === 'completed';
  const canComplete = match.status === 'confirmed';
  const enrolled = match.enrolled_count ?? enrollments.length;
  const max = match.max_players;

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Back nav */}
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
                {formatDate(match.date)} · {match.start_time}–{match.end_time}
              </Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
              <Text style={[styles.statusText, { color: statusColor.text }]}>
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
                    { width: `${Math.min((enrolled / max) * 100, 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.enrollCountText}>
                {enrolled} / {max} jugadores
              </Text>
            </View>
          )}

          {match.type === 'open' && match.price_per_player != null && (
            <Text style={styles.priceLine}>
              ${match.price_per_player.toFixed(2)} por jugador
              {match.min_players != null
                ? ` · Mín. ${match.min_players}`
                : ''}
            </Text>
          )}

          {match.type === 'reservation' && match.total_price != null && (
            <Text style={styles.priceLine}>
              Reserva · ${match.total_price.toFixed(2)} total
            </Text>
          )}
        </View>

        {/* Complete match button */}
        {canComplete && (
          <TouchableOpacity
            style={[styles.completeButton, completingMatch && styles.buttonDisabled]}
            onPress={handleCompleteMatch}
            disabled={completingMatch}
            activeOpacity={0.8}
          >
            {completingMatch ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.completeButtonText}>Completar partido</Text>
            )}
          </TouchableOpacity>
        )}

        {/* Enrollments section */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>
            Jugadores inscritos
            {enrollments.length > 0 ? ` (${enrollments.length})` : ''}
          </Text>
          {canMarkAttendance && (
            <Text style={styles.sectionHint}>Toca ✓ para marcar asistencia</Text>
          )}
        </View>

        {enrollments.length === 0 ? (
          <View style={styles.emptyEnrollments}>
            <Text style={styles.emptyEnrollmentsText}>
              Aún no hay jugadores inscritos.
            </Text>
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
                  {playerEmail ? (
                    <Text style={styles.playerEmail}>{playerEmail}</Text>
                  ) : null}
                  <View style={styles.playerBadges}>
                    <View
                      style={[
                        styles.badge,
                        isPaid ? styles.badgePaid : styles.badgeCash,
                      ]}
                    >
                      <Text
                        style={[
                          styles.badgeText,
                          isPaid ? styles.badgeTextPaid : styles.badgeTextCash,
                        ]}
                      >
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
                    style={[
                      styles.attendanceToggle,
                      attended && styles.attendanceToggleActive,
                    ]}
                    onPress={() => toggleAttendance(enrollment)}
                    disabled={isUpdating}
                    activeOpacity={0.75}
                  >
                    {isUpdating ? (
                      <ActivityIndicator
                        size="small"
                        color={attended ? '#ffffff' : '#16a34a'}
                      />
                    ) : (
                      <Text
                        style={[
                          styles.attendanceToggleText,
                          attended && styles.attendanceToggleTextActive,
                        ]}
                      >
                        ✓
                      </Text>
                    )}
                  </TouchableOpacity>
                )}
              </View>
            );
          })
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 32,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  backArrow: {
    marginBottom: 16,
  },
  backArrowText: {
    fontSize: 15,
    color: '#16a34a',
    fontWeight: '600',
  },
  matchCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  matchCardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  matchCardLeft: {
    flex: 1,
    marginRight: 12,
  },
  matchSport: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  matchField: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
    marginBottom: 4,
  },
  matchDate: {
    fontSize: 13,
    color: '#64748b',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  enrollRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  enrollBarWrap: {
    flex: 1,
    height: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  enrollFill: {
    height: 6,
    backgroundColor: '#16a34a',
    borderRadius: 3,
  },
  enrollCountText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  priceLine: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },
  completeButton: {
    backgroundColor: '#1d4ed8',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#1d4ed8',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  completeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  sectionHint: {
    fontSize: 12,
    color: '#64748b',
  },
  emptyEnrollments: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyEnrollmentsText: {
    fontSize: 14,
    color: '#64748b',
  },
  playerRow: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 8,
  },
  playerAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#dcfce7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  playerAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803d',
  },
  playerInfo: {
    flex: 1,
  },
  playerName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 2,
  },
  playerEmail: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 6,
  },
  playerBadges: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgePaid: {
    backgroundColor: '#dbeafe',
  },
  badgeCash: {
    backgroundColor: '#fef9c3',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  badgeTextPaid: {
    color: '#1d4ed8',
  },
  badgeTextCash: {
    color: '#92400e',
  },
  enrollmentStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#f3f4f6',
  },
  enrollmentStatusText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#374151',
  },
  attendanceToggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  attendanceToggleActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  attendanceToggleText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#d1d5db',
  },
  attendanceToggleTextActive: {
    color: '#ffffff',
  },
  errorLarge: {
    fontSize: 15,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  retryButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  bottomSpacer: {
    height: 24,
  },
});
