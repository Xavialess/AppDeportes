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
  if (isEnrolled) return { allowed: false, reason: null }; // handled by UI badge
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
      // Fetch match details
      const { data, error: matchErr } = await supabase
        .from('matches')
        .select('id, date, start_time, end_time, format, type, status, price_per_player, min_players, max_players, confirmation_deadline, sports(id, name, icon), fields(id, name, address, city_id)')
        .eq('id', id)
        .single();

      if (matchErr || !data) throw matchErr ?? new Error('Partido no encontrado');

      const raw = data as unknown as Omit<MatchDetail, 'enrolled_count'>;

      // Enrollment count
      const { count: enrollCount, error: countErr } = await supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', id)
        .in('status', ['pending', 'confirmed']);

      if (countErr) throw countErr;

      const fullMatch: MatchDetail = { ...raw, enrolled_count: enrollCount ?? 0 };
      setMatch(fullMatch);

      // Check if current user is enrolled
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
        <Stack.Screen options={{ title: 'Partido' }} />
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  if (error || !match) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Partido' }} />
        <Text style={styles.errorText}>{error ?? 'Partido no encontrado.'}</Text>
        <TouchableOpacity onPress={loadMatch} style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sportLabel = match.sports
    ? `${match.sports.name}${match.format ? ' ' + match.format : ''}`
    : match.format ?? 'Partido';

  const { label: deadlineLabel, expired: deadlineExpired } = formatDeadlineDetail(match.confirmation_deadline);
  const { allowed: enrollAllowed } = canEnroll(match, isEnrolled);

  const isFull = match.max_players != null && match.enrolled_count >= match.max_players;
  const isCancelled = match.status === 'cancelled';

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: sportLabel }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
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
          <InfoRow icon="📍" label="Cancha" value={match.fields?.name ?? '—'} />
          {match.fields?.address ? (
            <InfoRow icon="" label="Dirección" value={match.fields.address} />
          ) : null}
          <Divider />
          <InfoRow icon="📅" label="Fecha" value={formatFullDate(match.date)} />
          <InfoRow
            icon="🕐"
            label="Horario"
            value={`${formatTime(match.start_time)} – ${formatTime(match.end_time)}`}
          />
          <Divider />
          <InfoRow icon="💰" label="Precio por jugador" value={formatPrice(match.price_per_player)} highlight />
          <Divider />
          <InfoRow
            icon="👥"
            label="Jugadores inscritos"
            value={`${match.enrolled_count}${match.max_players != null ? ` / ${match.max_players}` : ''}`}
          />
          {match.min_players != null ? (
            <View style={styles.minPlayersNote}>
              <Text style={styles.minPlayersText}>
                Mínimo {match.min_players} jugadores · el partido se cancela si no se llega al mínimo
              </Text>
            </View>
          ) : null}
          <Divider />
          <InfoRow
            icon="⏰"
            label="Inscripción"
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
            <Text style={styles.ctaButtonText}>Inscribirme — {formatPrice(match.price_per_player)}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

// ---- sub-components -------------------------------------------------------

interface InfoRowProps {
  icon: string;
  label: string;
  value: string;
  highlight?: boolean;
  valueStyle?: object;
}

function InfoRow({ icon, label, value, highlight, valueStyle }: InfoRowProps) {
  return (
    <View style={infoRowStyles.row}>
      <Text style={infoRowStyles.icon}>{icon}</Text>
      <View style={infoRowStyles.content}>
        <Text style={infoRowStyles.label}>{label}</Text>
        <Text style={[infoRowStyles.value, highlight && infoRowStyles.valueHighlight, valueStyle]}>
          {value}
        </Text>
      </View>
    </View>
  );
}

function Divider() {
  return <View style={{ height: 1, backgroundColor: '#f1f5f9', marginVertical: 4 }} />;
}

const infoRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    gap: 12,
  },
  icon: {
    fontSize: 18,
    width: 24,
    textAlign: 'center',
    marginTop: 1,
  },
  content: {
    flex: 1,
  },
  label: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 2,
  },
  value: {
    fontSize: 15,
    color: '#0f172a',
    fontWeight: '500',
  },
  valueHighlight: {
    fontSize: 20,
    fontWeight: '800',
    color: '#16a34a',
  },
});

// ---- styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 12,
  },
  headerCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  sportTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  statusRow: {
    flexDirection: 'row',
  },
  badge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  badgeOpen: {
    backgroundColor: '#dcfce7',
  },
  badgeConfirmed: {
    backgroundColor: '#dbeafe',
  },
  badgeCancelled: {
    backgroundColor: '#fee2e2',
  },
  badgeText: {
    fontSize: 13,
    fontWeight: '600',
  },
  badgeTextOpen: {
    color: '#16a34a',
  },
  badgeTextConfirmed: {
    color: '#1d4ed8',
  },
  badgeTextCancelled: {
    color: '#dc2626',
  },
  infoCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  minPlayersNote: {
    backgroundColor: '#fef9c3',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
  },
  minPlayersText: {
    fontSize: 12,
    color: '#854d0e',
    lineHeight: 16,
  },
  valueExpired: {
    color: '#dc2626',
  },
  bottomBar: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  ctaButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: {
    backgroundColor: '#9ca3af',
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  enrolledBadge: {
    backgroundColor: '#dcfce7',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#86efac',
  },
  enrolledBadgeText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16a34a',
  },
  errorText: {
    fontSize: 15,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
