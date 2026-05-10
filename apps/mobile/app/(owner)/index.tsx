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

const STATUS_COLORS: Record<MatchStatus, { bg: string; text: string }> = {
  open: { bg: '#dcfce7', text: '#15803d' },
  confirmed: { bg: '#dbeafe', text: '#1d4ed8' },
  completed: { bg: '#f3f4f6', text: '#374151' },
  cancelled: { bg: '#fee2e2', text: '#b91c1c' },
};

function formatDate(dateStr: string): string {
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function MatchCard({ match }: { match: Match }) {
  const statusColor = STATUS_COLORS[match.status] ?? STATUS_COLORS.open;
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
        <View style={styles.cardBottom}>
          <View style={styles.enrollBar}>
            <View
              style={[
                styles.enrollFill,
                { width: `${Math.min((enrolled / max) * 100, 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.enrollCount}>
            {enrolled} / {max} jugadores
          </Text>
        </View>
      )}

      {match.type === 'reservation' && (
        <View style={styles.cardBottom}>
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
      // Fetch fields owned by this user first
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
      if (user) {
        loadMatches();
      }
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
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Panel del propietario</Text>
          {user?.email ? (
            <Text style={styles.subtitle}>{user.email}</Text>
          ) : null}
        </View>
        <TouchableOpacity
          style={styles.headerPostButton}
          onPress={() => router.push('/(owner)/post-match')}
          activeOpacity={0.8}
        >
          <Text style={styles.headerPostButtonText}>+ Partido</Text>
        </TouchableOpacity>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

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
            tintColor="#16a34a"
          />
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⚽</Text>
            <Text style={styles.emptyTitle}>Sin partidos todavía</Text>
            <Text style={styles.emptyText}>
              Publica tu primer partido tocando el botón "+" arriba a la derecha.
            </Text>
          </View>
        }
      />

      {/* Floating Action Button */}
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
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  title: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 2,
  },
  headerPostButton: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  headerPostButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 14,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  listEmpty: {
    flex: 1,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  cardLeft: {
    flex: 1,
    marginRight: 12,
  },
  cardSport: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 4,
  },
  cardDate: {
    fontSize: 13,
    color: '#64748b',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  cardBottom: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  enrollBar: {
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
  enrollCount: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    minWidth: 80,
    textAlign: 'right',
  },
  reservationLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 21,
  },
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 8,
  },
  fabText: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '300',
    lineHeight: 32,
  },
});
