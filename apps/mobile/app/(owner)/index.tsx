import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../hooks/useSession';
import { colors, radius, spacing } from '../../lib/theme';

type MatchStatus = 'open' | 'confirmed' | 'en_curso' | 'jugado' | 'completed' | 'cancelled';

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
  fields: { name: string; images: string[] } | null;
}

const STATUS_LABELS: Record<MatchStatus, string> = {
  open: 'Abierto',
  confirmed: 'Confirmado',
  en_curso: 'En curso',
  jugado: 'Jugado',
  completed: 'Jugado',
  cancelled: 'Cancelado',
};

const STATUS_STYLES: Record<MatchStatus, { bg: string; text: string }> = {
  open: { bg: 'rgba(212,255,58,0.1)', text: colors.accent },
  confirmed: { bg: 'rgba(96,165,250,0.1)', text: '#60a5fa' },
  en_curso: { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24' },
  jugado: { bg: 'rgba(52,211,153,0.1)', text: '#34d399' },
  completed: { bg: 'rgba(52,211,153,0.1)', text: '#34d399' },
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
  const coverImage = match.fields?.images?.[0] ?? null;
  const sportLabel = `${match.sports?.name ?? 'Deporte'}${match.format ? ` · ${match.format}` : ''}`;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/my-match/${match.id}` as any)}
      activeOpacity={0.75}
    >
      {coverImage ? (
        <Image source={{ uri: coverImage }} style={styles.cardCover} />
      ) : null}
      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={styles.sportPill}>
            <Text style={styles.cardSport}>{sportLabel}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>
              {STATUS_LABELS[match.status]}
            </Text>
          </View>
        </View>

        {match.fields?.name ? (
          <Text style={styles.cardField} numberOfLines={1}>{match.fields.name}</Text>
        ) : null}

        <Text style={styles.cardDate}>
          {formatMatchDate(match.date, match.start_time)}
        </Text>

        {match.type === 'open' && max != null && (
          <View style={styles.cardBottom}>
            <View style={styles.enrollBar}>
              <View
                style={[
                  styles.enrollFill,
                  { width: `${Math.min((enrolled / max) * 100, 100)}%` as any },
                  enrolled >= max && styles.enrollFillFull,
                ]}
              />
            </View>
            <Text style={[styles.enrollCount, enrolled >= max && styles.enrollCountFull]}>
              {enrolled} / {max}
            </Text>
          </View>
        )}

        {match.type === 'reservation' && (
          <View style={styles.cardBottomRow}>
            <Text style={styles.reservationLabel}>Reserva completa</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

export default function OwnerHomeScreen() {
  const insets = useSafeAreaInsets();
  const { user, loading: sessionLoading } = useSession();

  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMatches() {
    if (!user) return;
    try {
      // Ownership is now via clubs — get owner's club ids first, then field ids
      const { data: clubsData, error: clubsError } = await supabase
        .from('clubs')
        .select('id')
        .eq('owner_id', user.id);

      if (clubsError) throw clubsError;

      const clubIds = (clubsData ?? []).map((c: { id: string }) => c.id);

      const fieldIds: string[] = [];
      if (clubIds.length > 0) {
        const { data: fieldsData, error: fieldsError } = await supabase
          .from('fields')
          .select('id')
          .in('club_id', clubIds);
        if (fieldsError) throw fieldsError;
        fieldIds.push(...(fieldsData ?? []).map((f: { id: string }) => f.id));
      }

      if (fieldIds.length === 0) {
        setMatches([]);
        return;
      }

      const { data, error: matchesError } = await supabase
        .from('matches')
        .select('id, date, start_time, end_time, status, type, max_players, format, sports(name), fields(name, images), enrollments(id, status)')
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
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
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
              <View style={styles.emptyIcon}>
                <View style={styles.emptyIconOuter}>
                  <View style={styles.emptyIconInner} />
                </View>
              </View>
              <Text style={styles.emptyTitle}>Sin partidos publicados</Text>
              <Text style={styles.emptyText}>Publica tu primer partido para empezar a recibir inscripciones.</Text>
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
    paddingBottom: 100,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  listEmpty: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cardCover: {
    width: '100%',
    height: 90,
    backgroundColor: colors.line,
  },
  cardBody: {
    padding: spacing.lg,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  sportPill: {
    backgroundColor: 'rgba(212,255,58,0.08)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    flexShrink: 1,
    marginRight: spacing.sm,
  },
  cardSport: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: -0.2,
  },
  cardField: {
    fontSize: 13,
    color: colors.mute,
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 12,
    color: colors.mute,
    fontWeight: '500',
    marginBottom: spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.badge,
    alignSelf: 'flex-start',
    flexShrink: 0,
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
    marginTop: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  cardBottomRow: {
    marginTop: spacing.sm,
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
  enrollCountFull: {
    color: colors.error,
  },
  enrollFillFull: {
    backgroundColor: colors.error,
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
    paddingTop: 60,
  },
  emptyIcon: {
    marginBottom: 8,
  },
  emptyIconOuter: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconInner: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(212, 255, 58, 0.3)',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#ffffff',
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.45)',
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
