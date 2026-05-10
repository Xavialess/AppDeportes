import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../hooks/useSession';
import { colors, radius, spacing } from '../../lib/theme';

type MatchStatus = 'open' | 'confirmed' | 'completed' | 'cancelled';

interface Match {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  status: MatchStatus;
  type: 'open' | 'reservation';
  enrolled_count: number | null;
  max_players: number | null;
  format: string | null;
  sports: { name: string } | null;
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

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatMatchDate(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return `${DAYS_ES[date.getDay()]} ${day} ${MONTHS_ES[month - 1]} · ${timeStr.slice(0, 5)}`;
}

function MatchCard({ match }: { match: Match }) {
  const statusStyle = STATUS_STYLES[match.status] ?? STATUS_STYLES.open;
  const enrolled = match.enrolled_count ?? 0;
  const max = match.max_players;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/(owner)/match/${match.id}`)}
      activeOpacity={0.75}
    >
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.cardSport}>
            {match.sports?.name ?? 'Deporte'}
            {match.format ? ` · ${match.format}` : ''}
          </Text>
          <Text style={styles.cardDate}>
            {formatMatchDate(match.date, match.start_time)}
          </Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {STATUS_LABELS[match.status]}
          </Text>
        </View>
      </View>

      {match.type === 'open' && max != null && (
        <View style={styles.cardBottom}>
          <View style={styles.enrollBar}>
            <View
              style={[
                styles.enrollFill,
                { width: `${Math.min((enrolled / max) * 100, 100)}%` as any },
              ]}
            />
          </View>
          <Text style={styles.enrollCount}>{enrolled} / {max}</Text>
        </View>
      )}

      {match.type === 'reservation' && (
        <View style={styles.cardBottomRow}>
          <Text style={styles.reservationLabel}>Reserva completa</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function OwnerHomeScreen() {
  const { user, loading: sessionLoading } = useSession();

  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMatches() {
    if (!user) return;
    try {
      const { data: fieldsData, error: fieldsError } = await supabase
        .from('fields')
        .select('id')
        .eq('owner_id', user.id);

      if (fieldsError) throw fieldsError;

      const fieldIds = (fieldsData ?? []).map((f: { id: string }) => f.id);

      if (fieldIds.length === 0) {
        setMatches([]);
        return;
      }

      const { data, error: matchesError } = await supabase
        .from('matches')
        .select('id, date, start_time, end_time, status, type, max_players, format, sports(name), enrollments(id, status)')
        .in('field_id', fieldIds)
        .order('date', { ascending: false })
        .order('start_time', { ascending: false });

      if (matchesError) throw matchesError;

      const shaped = (data ?? []).map((m: any) => {
        const active = (m.enrollments ?? []).filter(
          (e: { status: string }) => e.status !== 'cancelled' && e.status !== 'refunded',
        ).length;
        const { enrollments: _, ...rest } = m;
        return { ...rest, enrolled_count: active };
      });
      setMatches(shaped as Match[]);
      setError(null);
    } catch {
      setError('No se pudieron cargar los partidos.');
    }
  }

  useEffect(() => {
    if (!sessionLoading && user) {
      loadMatches().finally(() => setLoading(false));
    } else if (!sessionLoading && !user) {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, sessionLoading]);

  useFocusEffect(
    useCallback(() => {
      if (user) loadMatches();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadMatches();
    setRefreshing(false);
  }

  if (loading || sessionLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <MatchCard match={item} />}
        contentContainerStyle={[
          styles.listContent,
          matches.length === 0 && styles.listEmpty,
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
          />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTag}>Panel del propietario</Text>
              <Text style={styles.headerTitle}>
                cancha<Text style={styles.headerDot}>.</Text>
              </Text>
              {user?.email ? (
                <Text style={styles.headerEmail}>{user.email}</Text>
              ) : null}
            </View>
            <TouchableOpacity
              style={styles.postButton}
              onPress={() => router.push('/(owner)/post-match')}
              activeOpacity={0.8}
            >
              <Text style={styles.postButtonText}>+ Partido</Text>
            </TouchableOpacity>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Sin partidos todavía</Text>
              <Text style={styles.emptyText}>
                Publica tu primer partido tocando el botón "+ Partido" arriba.
              </Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />

      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(owner)/post-match')}
        activeOpacity={0.85}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: 64,
    paddingBottom: spacing.lg,
  },
  headerTag: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dim,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.6,
  },
  headerDot: {
    color: colors.accent,
  },
  headerEmail: {
    fontSize: 12,
    color: colors.dim,
    marginTop: 4,
  },
  postButton: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.badge,
    marginTop: 36,
  },
  postButtonText: {
    color: colors.accentFg,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: -0.1,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 100,
    gap: spacing.md,
  },
  listEmpty: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.cardLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  cardSport: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
    letterSpacing: -0.2,
  },
  cardDate: {
    fontSize: 12,
    color: colors.mute,
    fontWeight: '500',
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
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cardBottomRow: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  enrollBar: {
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
  enrollCount: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.mute,
    minWidth: 40,
    textAlign: 'right',
  },
  reservationLabel: {
    fontSize: 12,
    color: colors.mute,
    fontWeight: '500',
  },
  errorBox: {
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '500',
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 60,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.mute,
    textAlign: 'center',
    lineHeight: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: {
    color: colors.accentFg,
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
});
