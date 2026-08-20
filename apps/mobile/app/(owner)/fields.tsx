import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Image,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../hooks/useSession';
import { colors, radius, spacing, fonts } from '../../lib/theme';
import SkeletonCard from '../../components/SkeletonCard';
import FadeIn from '../../components/FadeIn';

interface Club {
  id: string;
  name: string;
  address: string;
  images: string[];
  cities: { name: string } | null;
}

function ClubCard({ club }: { club: Club }) {
  const cover = club.images[0] ?? null;
  const cityName = club.cities?.name ?? null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/club/${club.id}` as any)}
      activeOpacity={0.75}
    >
      {cover ? (
        <Image source={{ uri: cover }} style={styles.cardImage} resizeMode="cover" />
      ) : (
        <View style={styles.cardImagePlaceholder}>
          <Text style={styles.cardImagePlaceholderText}>Sin fotos</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{club.name}</Text>
        {cityName ? (
          <Text style={styles.cardCity} numberOfLines={1}>{cityName}</Text>
        ) : null}
        <Text style={styles.cardAddress} numberOfLines={1}>{club.address}</Text>
      </View>
    </TouchableOpacity>
  );
}

export default function OwnerComplejos() {
  const insets = useSafeAreaInsets();
  const { user, loading: sessionLoading } = useSession();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  async function loadClubs() {
    if (!user) return;
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('clubs')
        .select('id, name, address, images, cities(name)')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false });

      if (err) throw err;
      setClubs((data ?? []) as Club[]);
    } catch {
      setError('No se pudieron cargar los complejos.');
    }
  }

  useFocusEffect(
    useCallback(() => {
      if (!sessionLoading && user) {
        // Only show the full loading state on first load — a refocus keeps
        // the last-known list on screen while it refreshes quietly underneath.
        if (!hasDataRef.current) setLoading(true);
        loadClubs().finally(() => {
          hasDataRef.current = true;
          setLoading(false);
        });
      } else if (!sessionLoading) {
        setLoading(false);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user, sessionLoading])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await loadClubs();
    setRefreshing(false);
  }

  if (loading || sessionLoading) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 80 }]}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} index={i} />
        ))}
      </View>
    );
  }

  return (
    <FadeIn style={styles.flex}>
      <FlatList
        data={clubs}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <ClubCard club={item} />}
        contentContainerStyle={[
          styles.listContent,
          clubs.length === 0 && styles.listEmpty,
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
            <Text style={styles.headerTag}>Panel del propietario</Text>
            <Text style={styles.headerTitle}>
              Complejos<Text style={styles.headerDot}>.</Text>
            </Text>
          </View>
        }
        ListEmptyComponent={
          error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : (
            <View style={styles.emptyState}>
              <View style={styles.emptyIconOuter}>
                <View style={styles.emptyIconInner} />
              </View>
              <Text style={styles.emptyTitle}>Sin complejos registrados</Text>
              <Text style={styles.emptyText}>
                Tus complejos deportivos aparecerán aquí. Regístralos desde el panel web.
              </Text>
            </View>
          )
        }
        showsVerticalScrollIndicator={false}
      />
    </FadeIn>
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
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.6,
  },
  headerDot: {
    color: colors.accent,
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
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  cardImage: {
    width: '100%',
    height: 160,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 160,
    backgroundColor: colors.card2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardImagePlaceholderText: {
    fontSize: 12,
    color: colors.dim,
    fontWeight: '500',
  },
  cardBody: {
    padding: spacing.lg,
    gap: 3,
  },
  cardName: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  cardCity: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
  },
  cardAddress: {
    fontSize: 13,
    color: colors.mute,
    fontWeight: '400',
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
    paddingTop: 60,
  },
  emptyIconOuter: {
    width: 64,
    height: 64,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyIconInner: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'rgba(212,255,58,0.3)',
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.mute,
    textAlign: 'center',
    lineHeight: 20,
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
});
