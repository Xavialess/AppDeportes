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
  Modal,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../lib/theme';
import { formatPrice } from '../../lib/format';
import SkeletonCard from '../../components/SkeletonCard';

const CITY_STORE_KEY = 'selected_city_id';

// ---- types ---------------------------------------------------------------

interface City {
  id: string;
  name: string;
}

interface Sport {
  id: string;
  name: string;
  icon: string | null;
}

interface Field {
  id: string;
  name: string;
  images: string[];
  city_id: string;
  clubs: { id: string; name: string; address: string } | null;
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

interface DayItem {
  date: string; // YYYY-MM-DD
  dayName: string;
  dayNum: number;
  isToday: boolean;
}

function generateDays(count = 14): DayItem[] {
  const result: DayItem[] = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i);
    result.push({
      date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      dayName: DAYS_ES[d.getDay()],
      dayNum: d.getDate(),
      isToday: i === 0,
    });
  }
  return result;
}

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

  const days = generateDays(14);

  const [matches, setMatches] = useState<Match[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [selectedSportId, setSelectedSportId] = useState<string | null>(null);
  const [selectedCityId, setSelectedCityId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>(days[0].date); // today by default
  const [cityPickerVisible, setCityPickerVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchMatches(cityId: string | null, sportId: string | null, date: string) {
    setError(null);
    try {
      let query = supabase
        .from('matches')
        .select(
          'id, date, start_time, end_time, format, type, status, price_per_player, min_players, max_players, confirmation_deadline, sport_id, sports(id, name, icon), fields!inner(id, name, images, city_id, clubs(id, name, address))'
        )
        .in('status', ['open', 'confirmed', 'en_curso'])
        .eq('is_visible', true)
        .eq('date', date)
        .order('start_time', { ascending: true });

      if (cityId) {
        query = query.eq('fields.city_id', cityId);
      }
      if (sportId) {
        query = query.eq('sport_id', sportId);
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
    } catch (err) {
      console.error('[fetchMatches]', JSON.stringify(err));
      setError('No se pudieron cargar los partidos. Intenta de nuevo.');
    }
  }

  // Single init: resolves city (saved or first available) before first fetch
  useEffect(() => {
    async function init() {
      const [saved, citiesRes, sportsRes] = await Promise.all([
        SecureStore.getItemAsync(CITY_STORE_KEY),
        supabase.from('cities').select('id, name').eq('is_active', true).order('name'),
        supabase.from('sports').select('id, name, icon').eq('is_active', true).order('name'),
      ]);

      const fetchedCities = (citiesRes.data ?? []) as City[];
      setCities(fetchedCities);
      if (sportsRes.data) setSports(sportsRes.data as Sport[]);

      let resolvedCityId = saved ?? null;
      if (!resolvedCityId && fetchedCities.length > 0) {
        resolvedCityId = fetchedCities[0].id;
        await SecureStore.setItemAsync(CITY_STORE_KEY, resolvedCityId);
      }
      setSelectedCityId(resolvedCityId);

      await fetchMatches(resolvedCityId, null, days[0].date);
      setLoading(false);
    }

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!loading) {
      fetchMatches(selectedCityId, selectedSportId, selectedDate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId, selectedCityId, selectedDate]);

  async function handleCitySelect(cityId: string) {
    setSelectedCityId(cityId);
    setCityPickerVisible(false);
    await SecureStore.setItemAsync(CITY_STORE_KEY, cityId);
  }

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchMatches(selectedCityId, selectedSportId, selectedDate);
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSportId, selectedCityId, selectedDate]);

  const selectedCity = cities.find((c) => c.id === selectedCityId) ?? null;

  function renderMatchCard({ item }: { item: Match }) {
    const sportIcon = item.sports?.icon ?? null;
    const sportLabel = item.sports
      ? `${sportIcon ? sportIcon + ' ' : ''}${item.sports.name}${item.format ? ' · ' + item.format : ''}`
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
            {slotsLeft !== null && (
              slotsLeft > 0 ? (
                <View style={styles.slotsBadge}>
                  <Text style={styles.slotsBadgeText}>{slotsLeft} CUPO{slotsLeft !== 1 ? 'S' : ''}</Text>
                </View>
              ) : (
                <View style={styles.fullBadge}>
                  <Text style={styles.fullBadgeText}>LLENO</Text>
                </View>
              )
            )}
          </View>

          <Text style={styles.cardField} numberOfLines={1}>
            {item.fields?.clubs?.name ?? item.fields?.name ?? '—'}
          </Text>
          {item.fields?.name && item.fields?.clubs?.name ? (
            <Text style={styles.cardFieldSub} numberOfLines={1}>
              {item.fields.name}
            </Text>
          ) : null}

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
                      item.enrolled_count >= item.max_players && styles.progressFillFull,
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
          <View style={styles.screenHeaderRow}>
            <View>
              <Text style={styles.screenTag}>Partidos abiertos</Text>
              <Text style={styles.screenTitle}>
                cancha<Text style={styles.screenTitleDot}>.</Text>
              </Text>
            </View>

            <TouchableOpacity
              style={styles.cityPill}
              onPress={() => setCityPickerVisible(true)}
              activeOpacity={0.75}
            >
              <Ionicons
                name="location-sharp"
                size={12}
                color={colors.accentFg}
                style={{ marginRight: 4 }}
              />
              <Text style={styles.cityPillText}>
                {selectedCity?.name ?? '—'}
              </Text>
              <Ionicons
                name="chevron-down"
                size={11}
                color={colors.accentFg}
                style={{ marginLeft: 2 }}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Day strip */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.dayStripContainer}
          contentContainerStyle={styles.dayStripContent}
        >
          {days.map((day) => {
            const active = selectedDate === day.date;
            return (
              <TouchableOpacity
                key={day.date}
                style={[styles.dayPill, active && styles.dayPillActive]}
                onPress={() => setSelectedDate(day.date)}
                activeOpacity={0.7}
              >
                <Text style={[styles.dayPillName, active && styles.dayPillNameActive]}>
                  {day.isToday ? 'HOY' : day.dayName.toUpperCase()}
                </Text>
                <Text style={[styles.dayPillNum, active && styles.dayPillNumActive]}>
                  {day.dayNum}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Sport chips */}
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
                {sport.icon ? `${sport.icon} ${sport.name}` : sport.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  function renderCityPicker() {
    return (
      <Modal
        visible={cityPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCityPickerVisible(false)}
      >
        <Pressable style={styles.pickerOverlay} onPress={() => setCityPickerVisible(false)}>
          <Pressable style={[styles.pickerSheet, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.pickerHandle} />

            <Text style={styles.pickerTitle}>¿Dónde juegas?</Text>

            {cities.map((city) => (
              <TouchableOpacity
                key={city.id}
                style={styles.cityRow}
                onPress={() => handleCitySelect(city.id)}
                activeOpacity={0.7}
              >
                <View style={styles.cityRowLeft}>
                  <View style={[styles.cityDot, selectedCityId === city.id && styles.cityDotActive]} />
                  <Text style={[styles.cityRowText, selectedCityId === city.id && styles.cityRowTextActive]}>
                    {city.name}
                  </Text>
                </View>
                {selectedCityId === city.id && (
                  <Ionicons name="checkmark" size={18} color={colors.accent} />
                )}
              </TouchableOpacity>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
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
          <TouchableOpacity onPress={() => fetchMatches(selectedCityId, selectedSportId, selectedDate)} style={styles.retryButton}>
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
                {selectedCity
                  ? `No hay partidos en ${selectedCity.name} para este día.`
                  : 'No hay partidos para este día.'}
                {'\n'}Prueba otro día o deporte.
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

      {renderCityPicker()}
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

  // ---- header ----
  screenHeader: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
  },
  screenHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
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

  // ---- city pill (always accent — city is always selected) ----
  cityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 4,
  },
  cityPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentFg,
  },

  // ---- day strip ----
  dayStripContainer: {
    marginBottom: 6,
  },
  dayStripContent: {
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  dayPill: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.line,
  },
  dayPillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dayPillName: {
    fontSize: 9,
    fontWeight: '700',
    color: colors.dim,
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  dayPillNameActive: {
    color: colors.accentFg,
  },
  dayPillNum: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  dayPillNumActive: {
    color: colors.accentFg,
  },

  // ---- sport chips ----
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

  // ---- match card ----
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
    height: 90,
    backgroundColor: colors.line,
  },
  cardBody: {
    padding: 10,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
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
  fullBadge: {
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.badge,
  },
  fullBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.error,
    letterSpacing: 0.3,
  },
  progressFillFull: {
    backgroundColor: colors.error,
  },
  cardField: {
    fontSize: 12,
    color: colors.mute,
    marginBottom: 2,
  },
  cardFieldSub: {
    fontSize: 11,
    color: colors.dim,
    marginBottom: 2,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
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
    paddingTop: 8,
    gap: spacing.sm,
    marginTop: 4,
  },
  cardPrice: {
    fontSize: 17,
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

  // ---- city picker modal ----
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#141414',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 12,
    paddingHorizontal: spacing.xl,
  },
  pickerHandle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 20,
  },
  pickerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
  },
  cityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  cityRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  cityDotActive: {
    backgroundColor: colors.accent,
  },
  cityRowText: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.mute,
  },
  cityRowTextActive: {
    color: colors.text,
    fontWeight: '600',
  },

  // ---- empty / error ----
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
