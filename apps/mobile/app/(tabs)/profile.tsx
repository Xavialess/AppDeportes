import { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../lib/theme';
import { useSession } from '../../hooks/useSession';

// ---- types ---------------------------------------------------------------

interface UserProfile {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  matches_played: number;
  is_pro: boolean;
  role: string;
}

// ---- helpers --------------------------------------------------------------

function getInitials(name: string | null, email: string | null): string {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return '??';
}

// ---- component ------------------------------------------------------------

export default function ProfileScreen() {
  const { user, loading: sessionLoading } = useSession();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  async function fetchProfile() {
    if (!user) return;
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('users')
        .select('id, name, email, avatar_url, matches_played, is_pro, role')
        .eq('id', user.id)
        .single();

      if (err) throw err;
      setProfile(data as UserProfile);
    } catch {
      setError('No se pudo cargar el perfil. Intenta de nuevo.');
    }
  }

  async function loadData() {
    setLoading(true);
    await fetchProfile();
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
    await fetchProfile();
    setRefreshing(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace('/');
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
        <Text style={styles.emptySubtitle}>Inicia sesión para ver tu perfil.</Text>
      </View>
    );
  }

  const initials = getInitials(profile?.name ?? null, profile?.email ?? user.email ?? null);
  const displayName = profile?.name ?? user.email ?? '—';
  const displayEmail = profile?.email ?? user.email ?? '—';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <View style={styles.screenHeader}>
        <Text style={styles.screenTag}>Cuenta</Text>
        <Text style={styles.screenTitle}>
          Perfil<Text style={styles.screenTitleDot}>.</Text>
        </Text>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={loadData} style={styles.retryButton}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Avatar + name section */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitials}>{initials}</Text>
        </View>

        <View style={styles.nameBlock}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName} numberOfLines={1}>
              {displayName}
            </Text>
            {profile?.is_pro && (
              <View style={styles.proBadge}>
                <Text style={styles.proBadgeText}>PRO</Text>
              </View>
            )}
          </View>
          <Text style={styles.displayEmail} numberOfLines={1}>
            {displayEmail}
          </Text>
        </View>
      </View>

      {/* Stats card */}
      <View style={styles.statsCard}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{profile?.matches_played ?? 0}</Text>
          <Text style={styles.statLabel}>Partidos jugados</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {profile?.role === 'owner' || profile?.role === 'admin' ? 'Propietario' : 'Jugador'}
          </Text>
          <Text style={styles.statLabel}>Rol</Text>
        </View>
      </View>

      {/* Account section */}
      <View style={styles.sectionLabel}>
        <Text style={styles.sectionLabelText}>Cuenta</Text>
      </View>

      <View style={styles.menuCard}>
        <View style={styles.menuRow}>
          <Text style={styles.menuRowLabel}>Plan</Text>
          <Text style={styles.menuRowValue}>{profile?.is_pro ? 'Pro' : 'Gratis'}</Text>
        </View>
        <View style={styles.menuDivider} />
        <View style={styles.menuRow}>
          <Text style={styles.menuRowLabel}>Miembro desde</Text>
          <Text style={styles.menuRowValue}>
            {user.created_at
              ? new Date(user.created_at).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' })
              : '—'}
          </Text>
        </View>
      </View>

      {/* Sign out */}
      <TouchableOpacity
        style={[styles.signOutButton, signingOut && styles.signOutButtonDisabled]}
        onPress={handleSignOut}
        disabled={signingOut}
        activeOpacity={0.75}
      >
        {signingOut ? (
          <ActivityIndicator size="small" color={colors.error} />
        ) : (
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ---- styles ---------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    paddingBottom: 60,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.xl,
  },
  screenHeader: {
    paddingHorizontal: spacing.xl,
    paddingTop: 64,
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
  avatarSection: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    gap: spacing.lg,
  },
  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarInitials: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.accentFg,
    letterSpacing: -0.5,
  },
  nameBlock: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 4,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  proBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.badge,
    flexShrink: 0,
  },
  proBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accentFg,
    letterSpacing: 0.5,
  },
  displayEmail: {
    fontSize: 13,
    color: colors.mute,
  },
  statsCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.line,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  statItem: {
    flex: 1,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.6,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.line,
    marginVertical: spacing.lg,
  },
  sectionLabel: {
    paddingHorizontal: spacing.xl,
    marginBottom: spacing.sm,
  },
  sectionLabelText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  menuCard: {
    backgroundColor: colors.card,
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xxl,
    borderRadius: radius.cardLg,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  menuRowLabel: {
    fontSize: 14,
    color: colors.text,
    fontWeight: '500',
  },
  menuRowValue: {
    fontSize: 14,
    color: colors.mute,
    fontWeight: '500',
  },
  menuDivider: {
    height: 1,
    backgroundColor: colors.line,
    marginHorizontal: spacing.lg,
  },
  signOutButton: {
    marginHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.card,
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  signOutButtonDisabled: {
    opacity: 0.6,
  },
  signOutText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.error,
    letterSpacing: -0.2,
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
    marginHorizontal: spacing.xl,
    marginBottom: spacing.xl,
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
