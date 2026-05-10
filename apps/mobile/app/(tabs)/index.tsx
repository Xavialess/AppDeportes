import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';

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

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return `$${price.toFixed(2)}`;
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
        .select('id, date, start_time, end_time, format, type, status, price_per_player, min_players, max_players, confirmation_deadline, sport_id, sports(id, name, icon), fields(id, name, address)')
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

      // Batch enrollment counts in a single query
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
      ? `${item.sports.name}${item.format ? ' ' + item.format : ''}`
      : item.format ?? '—';
    const dateLabel = formatMatchDate(item.date, item.start_time);
    const deadlineLabel = formatDeadline(item.confirmation_deadline);
    const slotsLeft = item.max_players != null
      ? item.max_players - item.enrolled_count
      : null;

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => router.push(`/match/${item.id}` as any)}
        activeOpacity={0.75}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.cardSport}>{sportLabel}</Text>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Abierto</Text>
          </View>
        </View>

        <Text style={styles.cardField} numberOfLines={1}>
          {item.fields?.name ?? '—'}
        </Text>

        <View style={styles.cardMeta}>
          <Text style={styles.cardMetaText}>{dateLabel}</Text>
        </View>

        <View style={styles.cardFooter}>
          <Text style={styles.cardPrice}>{formatPrice(item.price_per_player)}</Text>

          <View style={styles.cardRight}>
            {slotsLeft !== null && (
              <Text style={styles.cardSlots}>
                {item.enrolled_count}/{item.max_players} jugadores
              </Text>
            )}
            {deadlineLabel ? (
              <Text style={styles.cardDeadline}>{deadlineLabel}</Text>
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderHeader() {
    return (
      <View>
        <View style={styles.screenHeader}>
          <Text style={styles.screenTitle}>Partidos</Text>
          <Text style={styles.screenSubtitle}>Cerca de ti</Text>
        </View>

        {/* Sport filter chips */}
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
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#16a34a" />
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
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Sin partidos disponibles</Text>
              <Text style={styles.emptySubtitle}>
                No hay partidos abiertos en este momento. Vuelve pronto.
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#16a34a"
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
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  },
  list: {
    paddingBottom: 32,
  },
  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 2,
  },
  chipsContainer: {
    marginBottom: 12,
  },
  chipsContent: {
    paddingHorizontal: 20,
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  chipActive: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  chipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  chipTextActive: {
    color: '#ffffff',
  },
  card: {
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    marginBottom: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  cardSport: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
    marginRight: 8,
  },
  badge: {
    backgroundColor: '#dcfce7',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#16a34a',
  },
  cardField: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 8,
  },
  cardMeta: {
    marginBottom: 12,
  },
  cardMetaText: {
    fontSize: 13,
    color: '#64748b',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  cardPrice: {
    fontSize: 20,
    fontWeight: '800',
    color: '#16a34a',
  },
  cardRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  cardSlots: {
    fontSize: 13,
    color: '#374151',
    fontWeight: '500',
  },
  cardDeadline: {
    fontSize: 12,
    color: '#f59e0b',
    fontWeight: '500',
  },
  empty: {
    paddingHorizontal: 40,
    paddingTop: 60,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorBox: {
    margin: 20,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 12,
  },
  retryButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
});
