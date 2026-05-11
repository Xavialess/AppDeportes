import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../lib/theme';
import { formatPrice } from '../../lib/format';
import SkeletonCard from '../../components/SkeletonCard';

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
  images: string[];
}

interface Match {
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

function formatDeadline(deadlineStr: string | null): string | null {
  if (!deadlineStr) return null;
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  if (diffMs <= 0) return 'Inscripción cerrada';
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (diffHours >= 24) {
    const diffDays = Math.floor(diffHours / 24);
    return `Cierra en ${diffDays}d`;
  }
  if (diffHours > 0) return `Cierra en ${diffHours}h`;
  return `Cierra en ${diffMins}min`;
}

// ---- component ------------------------------------------------------------

export default function MatchListScreen() {
  const insets = useSafeAreaInsets();
  const [matches, setMatches] = useState<Match[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [selectedSportId, setSelectedSportId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchSports() {
    const { data, error: err } = await supabase
      .from('sports')
      .select('id, name, icon')
      .eq('is_active', true)
      .order('name');
    if (!err && data) {
      setSports(data as Sport[]);
    }
  }

  async function fetchMatches() {
    setError(null);
    try {
      let query = supabase
        .from('matches')
        .select('id, date, start_time, end_time, format, type, status, price_per_player, min_players, max_players, confirmation_deadline, sport_id, sports(id, name, icon), fields(id, name, address, images)')
        .eq('status', 'open')
        .eq('is_visible', true)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

      if (selectedSportId) {
        query = query.eq('sport_id', selectedSportId);
      }

      const { data, error: err } = await query;
      if (err) throw err;

      const rawMatches = (data ?? []) as unknown as (Omit<Match, 'enrolled_count'> & { sport_id: string })[];

      if (rawMatches.length === 0) {
        setMatches([]);
        return;
      }

      const matchIds = rawMatches.map((m) => m.id);
      const { data: enrollmentData, error: enrollErr } = await supabase
        .from('enrollments')
        .select('match_id')
        .in('match_id', matchIds)
        .in('status', ['pending', 'confirmed']);

      if (enrollErr) throw enrollErr;

      const countMap: Record<string, number> = {};
      for (const row of enrollmentData ?? []) {
        countMap[row.match_id] = (countMap[row.match_id] ?? 0) + 1;
      }

      const enriched: Match[] = rawMatches.map((m) => ({
        ...m,
        enrolled_count: countMap[m.id] ?? 0,
      }));

      setMatches(enriched);
    } catch {
      setError('No se pudieron cargar los partidos. Intenta de nuevo.');
    }
  }

  async function loadAll() {
    setLoading(true);
    await Promise.all([fetchSports(), fetchMatches()]);
    setLoading(false);
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchMatches();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMatches();
    setRefreshing(false);
  }, [selectedSportId]);

  function renderMatchCard({ item }: { item: Match }) {
    const sportLabel = item.sports
      ? `${item.sports.name}${item.format ? ' · ' + item.format : ''}`
      : item.format ?? '—';
    const dateLabel = formatMatchDate(item.date, item.start_time);
    const deadlineLabel = formatDeadline(item.confirmation_deadline);
    const slotsLeft = item.max_players != null
      ? item.max_players - item.enrolled_count
      : null;

    const coverImage = item.fields?.images?.[0] ?? null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/match/${item.id}` as any)}
        activeOpacity={0.75}
      >
        {coverImage ? (
          <Image source={{ uri: coverImage }} style={styles.cardCover} />
        ) : null}
        <View style={styles.cardBody}>
        <View style={styles.cardHeader}>
          <View style={styles.sportPill}>
            <Text style={styles.cardSport}>{sportLabel}</Text>
          </View>
          {slotsLeft !== null && slotsLeft > 0 && (
            <View style={styles.slotsBadge}>
              <Text style={styles.slotsBadgeText}>{slotsLeft} CUPO{slotsLeft !== 1 ? 'S' : ''}</Text>
            </View>
          )}
        </View>

        <Text style={styles.cardField} numberOfLines={1}>
          {item.fields?.name ?? '—'}
        </Text>

        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaText}>{dateLabel}</Text>
          {deadlineLabel ? (
            <Text style={styles.cardDeadline}>{deadlineLabel}</Text>
          ) : null}
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.cardPrice}>{formatPrice(item.price_per_player)}</Text>
          {item.max_players != null && (
            <View style={styles.progressRow}>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, (item.enrolled_count / item.max_players) * 100)}%` },
                  ]}
                />
              </View>
              <View style={styles.playerPill}>
                <Text style={styles.progressLabel}>
                  {item.enrolled_count}/{item.max_players}
                </Text>
              </View>
            </View>
          )}
        </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderHeader() {
    return (
      <View>
        <View style={[styles.screenHeader, { paddingTop: insets.top + 16 }]}>
          <Text style={styles.screenTag}>Partidos abiertos</Text>
          <Text style={styles.screenTitle}>
            cancha<Text style={styles.screenTitleDot}>.</Text>
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsContainer}
          contentContainerStyle={styles.chipsContent}
        >
          <TouchableOpacity
            style={[styles.chip, selectedSportId === null && styles.chipActive]}
            onPress={() => setSelectedSportId(null)}
          >
            <Text style={[styles.chipText, selectedSportId === null && styles.chipTextActive]}>
              Todos
            </Text>
          </TouchableOpacity>

          {sports.map((sport) => (
            <TouchableOpacity
              key={sport.id}
              style={[styles.chip, selectedSportId === sport.id && styles.chipActive]}
              onPress={() => setSelectedSportId(sport.id)}
            >
              <Text style={[styles.chipText, selectedSportId === sport.id && styles.chipTextActive]}>
                {sport.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: '#0a0a0a', paddingTop: 80 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonCard key={i} index={i} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => loadAll()} style={styles.retryButton}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        renderItem={renderMatchCard}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyState}>
              <View style={styles.emptyIcon}>
                <View style={styles.pitchOuter}>
                  <View style={styles.pitchCenter} />
                  <View style={styles.pitchLine} />
                </View>
              </View>
              <Text style={styles.emptyTitle}>No hay partidos cerca</Text>
              <Text style={styles.emptyText}>
                Prueba otro deporte o revisa más tarde.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
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
  chipsContainer: {
    marginBottom: spacing.md,
  },
  chipsContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  chipActive: {
    backgroundColor: colors.accent,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.text,
  },
  chipTextActive: {
    color: colors.accentFg,
  },
  card: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cardCover: {
    width: '100%',
    height: 140,
    backgroundColor: colors.line,
  },
  cardBody: {
    padding: spacing.lg,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  sportPill: {
    backgroundColor: 'rgba(212,255,58,0.08)',
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginRight: spacing.sm,
    flexShrink: 1,
  },
  cardSport: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: -0.2,
  },
  slotsBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.badge,
  },
  slotsBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accentFg,
    letterSpacing: 0.3,
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
    marginBottom: spacing.md,
  },
  cardMetaText: {
    fontSize: 12,
    color: colors.mute,
    fontWeight: '500',
  },
  cardDeadline: {
    fontSize: 11,
    color: colors.accent,
    fontWeight: '600',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  cardPrice: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: -0.4,
  },
  progressRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
  progressTrack: {
    flex: 1,
    maxWidth: 80,
    height: 4,
    backgroundColor: colors.card2,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
  },
  playerPill: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  progressLabel: {
    fontSize: 11,
    color: colors.mute,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingTop: 60,
    gap: 12,
  },
  emptyIcon: {
    marginBottom: 8,
  },
  pitchOuter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pitchCenter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  pitchLine: {
    position: 'absolute',
    width: '100%',
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.1)',
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
