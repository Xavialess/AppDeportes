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
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../../lib/supabase';
import { useSession } from '../../../hooks/useSession';
import { colors, radius, spacing, fonts } from '../../../lib/theme';
import SkeletonCard from '../../../components/SkeletonCard';
import FadeIn from '../../../components/FadeIn';

interface Club {
  id: string;
  name: string;
  address: string;
  owner_id: string;
}

interface Field {
  id: string;
  name: string;
  images: string[];
}

function FieldCard({ field }: { field: Field }) {
  const cover = field.images[0] ?? null;
  const imageCount = field.images.length;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => router.push(`/my-field/${field.id}` as any)}
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
        <Text style={styles.cardName} numberOfLines={1}>{field.name}</Text>
        <Text style={styles.cardImageCount}>
          {imageCount === 0 ? 'Sin imágenes' : `${imageCount} foto${imageCount !== 1 ? 's' : ''}`}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function ClubDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { user } = useSession();

  const [club, setClub] = useState<Club | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  async function load() {
    if (!id || !user) return;
    setError(null);
    try {
      const [clubRes, fieldsRes] = await Promise.all([
        supabase
          .from('clubs')
          .select('id, name, address, owner_id')
          .eq('id', id)
          .eq('owner_id', user.id)
          .single(),
        supabase
          .from('fields')
          .select('id, name, images')
          .eq('club_id', id)
          .order('created_at', { ascending: false }),
      ]);

      if (clubRes.error) throw clubRes.error;
      if (!clubRes.data) throw new Error('Complejo no encontrado');
      if (fieldsRes.error) throw fieldsRes.error;

      setClub(clubRes.data as Club);
      setFields((fieldsRes.data ?? []) as Field[]);
    } catch {
      setError('No se pudo cargar el complejo.');
    }
  }

  useFocusEffect(
    useCallback(() => {
      // Only show the full loading state on first load — a refocus keeps
      // the last-known content on screen while it refreshes quietly underneath.
      if (!hasDataRef.current) setLoading(true);
      load().finally(() => {
        hasDataRef.current = true;
        setLoading(false);
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, user?.id])
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <View style={[styles.flex, { paddingTop: insets.top + 80 }]}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} index={i} />
        ))}
      </View>
    );
  }

  if (!club) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorLabel}>{error ?? 'Complejo no encontrado.'}</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <FadeIn style={styles.flex}>
      <FlatList
        data={fields}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FieldCard field={item} />}
        contentContainerStyle={[
          styles.listContent,
          fields.length === 0 && styles.listEmpty,
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
            <TouchableOpacity style={styles.backChevron} onPress={() => router.back()} hitSlop={12}>
              <Text style={styles.backChevronText}>←</Text>
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTag}>Complejo</Text>
              <Text style={styles.headerTitle} numberOfLines={2}>{club.name}</Text>
              {club.address ? (
                <Text style={styles.headerAddress} numberOfLines={1}>{club.address}</Text>
              ) : null}
            </View>
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
              <Text style={styles.emptyTitle}>Sin canchas</Text>
              <Text style={styles.emptyText}>
                Agrega canchas a este complejo desde el panel web.
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
    paddingHorizontal: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  backChevron: {
    marginTop: 4,
    width: 36,
    height: 36,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  backChevronText: {
    fontSize: 18,
    color: colors.text,
    lineHeight: 20,
  },
  headerText: {
    flex: 1,
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
    fontSize: 24,
    fontWeight: '700',
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.5,
  },
  headerAddress: {
    fontSize: 13,
    color: colors.mute,
    marginTop: 2,
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
    height: 140,
  },
  cardImagePlaceholder: {
    width: '100%',
    height: 140,
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
    gap: 4,
  },
  cardName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.3,
  },
  cardImageCount: {
    fontSize: 12,
    color: colors.accent,
    fontWeight: '600',
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
  errorLabel: {
    fontSize: 15,
    color: colors.error,
    textAlign: 'center',
    fontWeight: '500',
  },
  backButton: {
    backgroundColor: colors.card,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  backButtonText: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '600',
  },
});
