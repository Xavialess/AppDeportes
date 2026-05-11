import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../lib/theme';
import { useSession } from '../../hooks/useSession';
import { formatPrice } from '../../lib/format';

// ---- types ---------------------------------------------------------------

type EnrollmentStatus = 'pending' | 'confirmed' | 'cancelled' | 'refunded';
type MatchStatus = 'open' | 'confirmed' | 'completed' | 'cancelled';

interface SportRef {
  name: string;
  icon: string | null;
}

interface FieldRef {
  name: string;
  address: string;
}

interface MatchRef {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: MatchStatus;
  type: 'open' | 'reservation';
  format: string | null;
  price_per_player: number | null;
  sports: SportRef | null;
  fields: FieldRef | null;
}

interface Enrollment {
  id: string;
  status: EnrollmentStatus;
  match_id: string;
  matches: MatchRef | null;
}

// ---- helpers --------------------------------------------------------------

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatMatchDate(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayName = DAYS_ES[date.getDay()];
  const monthName = MONTHS_ES[month - 1];
  const hhmm = timeStr.slice(0, 5);
  return `${dayName} ${day} ${monthName} · ${hhmm}`;
}

function isUpcoming(enrollment: Enrollment): boolean {
  const status = enrollment.status;
  return status === 'pending' || status === 'confirmed';
}

function sortEnrollments(enrollments: Enrollment[]): Enrollment[] {
  const order: Record<EnrollmentStatus, number> = {
    pending: 0,
    confirmed: 1,
    cancelled: 2,
    refunded: 3,
  };
  return [...enrollments].sort((a, b) => {
    const statusDiff = order[a.status] - order[b.status];
    if (statusDiff !== 0) return statusDiff;
    const dateA = a.matches?.date ?? '';
    const dateB = b.matches?.date ?? '';
    return dateA < dateB ? -1 : dateA > dateB ? 1 : 0;
  });
}

interface BadgeConfig {
  label: string;
  bgColor: string;
  textColor: string;
}

function getEnrollmentBadge(status: EnrollmentStatus): BadgeConfig {
  switch (status) {
    case 'pending':
      return { label: 'Pendiente', bgColor: 'rgba(212,255,58,0.15)', textColor: colors.accent };
    case 'confirmed':
      return { label: 'Confirmado', bgColor: 'rgba(96,165,250,0.15)', textColor: '#60a5fa' };
    case 'cancelled':
      return { label: 'Cancelado', bgColor: colors.errorBg, textColor: colors.error };
    case 'refunded':
      return { label: 'Reembolsado', bgColor: 'rgba(255,255,255,0.06)', textColor: colors.dim };
  }
}

// ---- component ------------------------------------------------------------

export default function MyMatchesScreen() {
  const insets = useSafeAreaInsets();
  const { user, loading: sessionLoading } = useSession();
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchEnrollments() {
    if (!user) return;
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('enrollments')
        .select(
          'id, status, match_id, matches(id, date, start_time, end_time, status, type, format, price_per_player, sports(name, icon), fields(name, address))'
        )
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setEnrollments(sortEnrollments((data ?? []) as unknown as Enrollment[]));
    } catch {
      setError('No se pudieron cargar tus partidos. Intenta de nuevo.');
    }
  }

  async function loadData() {
    setLoading(true);
    await fetchEnrollments();
    setLoading(false);
  }

  useFocusEffect(
    useCallback(() => {
      if (!sessionLoading) {
        loadData();
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionLoading, user?.id])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchEnrollments();
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  function renderCard({ item }: { item: Enrollment }) {
    const match = item.matches;
    if (!match) return null;

    const badge = getEnrollmentBadge(item.status);
    const upcoming = isUpcoming(item);
    const sportLabel = match.sports
      ? `${match.sports.name}${match.format ? ' · ' + match.format : ''}`
      : match.format ?? '—';
    const dateLabel = formatMatchDate(match.date, match.start_time);
    const isCancelled = item.status === 'cancelled';

    return (
      <TouchableOpacity
        style={[styles.card, isCancelled && styles.cardCancelled]}
        onPress={() => router.push(`/match/${match.id}` as any)}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeader}>
          <Text style={[styles.cardSport, isCancelled && styles.textMuted]} numberOfLines={1}>
            {sportLabel}
          </Text>
          <View style={[styles.badge, { backgroundColor: badge.bgColor }]}>
            <Text style={[styles.badgeText, { color: badge.textColor }]}>{badge.label}</Text>
          </View>
        </View>

        <Text style={styles.cardField} numberOfLines={1}>
          {match.fields?.name ?? '—'}
        </Text>

        <View style={styles.cardMeta}>
          <Text style={[styles.cardMetaText, isCancelled && styles.textMuted]}>{dateLabel}</Text>
          {isCancelled && (
            <Text style={styles.cancelledLabel}>Partido cancelado</Text>
          )}
          {!isCancelled && upcoming && match.price_per_player != null && (
            <Text style={styles.price}>{formatPrice(match.price_per_player)}</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  }

  function renderHeader() {
    const upcomingCount = enrollments.filter(isUpcoming).length;
    return (
      <View style={[styles.screenHeader, { paddingTop: insets.top + 16 }]}>
        <Text style={styles.screenTag}>Historial</Text>
        <Text style={styles.screenTitle}>
          Mis partidos<Text style={styles.screenTitleDot}>.</Text>
        </Text>
        {enrollments.length > 0 && (
          <Text style={styles.screenSubtitle}>
            {upcomingCount > 0
              ? `${upcomingCount} próximo${upcomingCount !== 1 ? 's' : ''}`
              : `${enrollments.length} inscripción${enrollments.length !== 1 ? 'es' : ''}`}
          </Text>
        )}
      </View>
    );
  }

  if (loading || sessionLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Sesión no iniciada</Text>
        <Text style={styles.emptySubtitle}>Inicia sesión para ver tus partidos.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadData} style={styles.retryButton}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={enrollments}
        keyExtractor={(item) => item.id}
        renderItem={renderCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          !error ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Sin inscripciones</Text>
              <Text style={styles.emptySubtitle}>
                Aún no te has inscrito en ningún partido. Explora los partidos disponibles en Inicio.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

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
    paddingHorizontal: spacing.xl,
  },
  list: {
    paddingBottom: 40,
  },
  screenHeader: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  screenTag: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.6,
  },
  screenTitleDot: {
    color: colors.accent,
  },
  screenSubtitle: {
    fontSize: 13,
    color: colors.mute,
    marginTop: 6,
    fontWeight: '500',
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: radius.cardLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardCancelled: {
    opacity: 0.6,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: spacing.sm,
  },
  cardSport: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
    letterSpacing: -0.2,
  },
  textMuted: {
    color: colors.mute,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.badge,
    flexShrink: 0,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cardField: {
    fontSize: 13,
    color: colors.mute,
    marginBottom: spacing.sm,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  cardMetaText: {
    fontSize: 12,
    color: colors.mute,
    fontWeight: '500',
    flex: 1,
  },
  cancelledLabel: {
    fontSize: 12,
    color: colors.error,
    fontWeight: '600',
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  empty: {
    paddingHorizontal: 40,
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    fontSize: 14,
    color: colors.mute,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBox: {
    margin: spacing.xl,
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: radius.card,
    padding: spacing.lg,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.md,
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
