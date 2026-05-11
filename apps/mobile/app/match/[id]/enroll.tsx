import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { useSession } from '../../../hooks/useSession';
import { colors, radius, spacing } from '../../../lib/theme';
import { formatPrice } from '../../../lib/format';

// ---- types ---------------------------------------------------------------

type PaymentMethod = 'in_person' | 'in_app';

interface MatchSummary {
  id: string;
  date: string;
  start_time: string;
  price_per_player: number | null;
  max_players: number | null;
  enrolled_count: number;
  sport_name: string;
  field_name: string;
}

// ---- helpers --------------------------------------------------------------

const MONTHS_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatShortDate(dateStr: string, timeStr: string): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const dayName = DAYS_ES[date.getDay()];
  const monthName = MONTHS_ES[month - 1];
  return `${dayName} ${day} ${monthName} · ${timeStr.slice(0, 5)}`;
}

// ---- screen ---------------------------------------------------------------

type ScreenState = 'loading' | 'error' | 'select' | 'confirming' | 'success';

export default function EnrollScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSession();

  const [matchSummary, setMatchSummary] = useState<MatchSummary | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    loadMatchSummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadMatchSummary() {
    setScreenState('loading');
    try {
      const { data, error: matchErr } = await supabase
        .from('matches')
        .select('id, date, start_time, price_per_player, max_players, sport_id, sports(name), fields(name)')
        .eq('id', id)
        .single();

      if (matchErr || !data) throw matchErr ?? new Error('Partido no encontrado');

      const raw = data as unknown as {
        id: string;
        date: string;
        start_time: string;
        price_per_player: number | null;
        max_players: number | null;
        sports: { name: string } | null;
        fields: { name: string } | null;
      };

      const { count: enrollCount } = await supabase
        .from('enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('match_id', id)
        .in('status', ['pending', 'confirmed']);

      setMatchSummary({
        id: raw.id,
        date: raw.date,
        start_time: raw.start_time,
        price_per_player: raw.price_per_player,
        max_players: raw.max_players,
        enrolled_count: enrollCount ?? 0,
        sport_name: raw.sports?.name ?? 'Partido',
        field_name: raw.fields?.name ?? '—',
      });
      setScreenState('select');
    } catch {
      setErrorMessage('No se pudo cargar la información del partido.');
      setScreenState('error');
    }
  }

  async function handleConfirm() {
    if (!selectedMethod || selectedMethod !== 'in_person') return;
    if (!user?.id || !id) return;
    if (!matchSummary) return;

    if (matchSummary.max_players != null && matchSummary.enrolled_count >= matchSummary.max_players) {
      setErrorMessage('Lo sentimos, el partido se ha llenado.');
      return;
    }

    setScreenState('confirming');
    setErrorMessage(null);

    try {
      const { error: insertErr } = await supabase
        .from('enrollments')
        .insert({
          match_id: id,
          user_id: user.id,
          status: 'pending',
        });

      if (insertErr) {
        if (insertErr.code === '23505') {
          setErrorMessage('Ya estás inscrito en este partido.');
          setScreenState('select');
          return;
        }
        throw insertErr;
      }

      setScreenState('success');
    } catch {
      setErrorMessage('No se pudo completar la inscripción. Intenta de nuevo.');
      setScreenState('select');
    }
  }

  const stackOptions = {
    title: 'Inscripción',
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.text,
    headerShadowVisible: false,
  };

  if (screenState === 'loading') {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={stackOptions} />
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (screenState === 'error' || !matchSummary) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={stackOptions} />
        <Text style={styles.errorText}>{errorMessage ?? 'Algo salió mal.'}</Text>
        <TouchableOpacity onPress={loadMatchSummary} style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (screenState === 'success') {
    return (
      <View style={styles.successContainer}>
        <Stack.Screen options={{ ...stackOptions, title: 'Confirmación' }} />
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>¡Inscripción confirmada!</Text>
        <Text style={styles.successSubtitle}>
          Recuerda llevar el pago el día del partido.
        </Text>

        <View style={styles.successCard}>
          <Text style={styles.successSport}>{matchSummary.sport_name}</Text>
          <Text style={styles.successField}>{matchSummary.field_name}</Text>
          <Text style={styles.successDate}>
            {formatShortDate(matchSummary.date, matchSummary.start_time)}
          </Text>
          <Text style={styles.successPrice}>{formatPrice(matchSummary.price_per_player)}</Text>
        </View>

        <TouchableOpacity
          style={styles.homeButton}
          onPress={() => router.replace('/(tabs)/' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.homeButtonText}>Volver al inicio</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const slotsLeft = matchSummary.max_players != null
    ? matchSummary.max_players - matchSummary.enrolled_count
    : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ ...stackOptions, title: 'Método de pago' }} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Match summary */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Partido</Text>
          <Text style={styles.summarySport}>{matchSummary.sport_name}</Text>
          <Text style={styles.summaryField}>{matchSummary.field_name}</Text>
          <Text style={styles.summaryDate}>
            {formatShortDate(matchSummary.date, matchSummary.start_time)}
          </Text>
          <View style={styles.summaryFooter}>
            <Text style={styles.summaryPrice}>{formatPrice(matchSummary.price_per_player)}</Text>
            {slotsLeft !== null && slotsLeft > 0 && (
              <Text style={styles.summarySlots}>
                {slotsLeft} lugar{slotsLeft !== 1 ? 'es' : ''} disponible{slotsLeft !== 1 ? 's' : ''}
              </Text>
            )}
          </View>
        </View>

        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{errorMessage}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>¿Cómo quieres pagar?</Text>

        <TouchableOpacity
          style={[styles.methodCard, selectedMethod === 'in_person' && styles.methodCardSelected]}
          onPress={() => setSelectedMethod('in_person')}
          activeOpacity={0.8}
        >
          <View style={styles.methodHeader}>
            <View style={[styles.radio, selectedMethod === 'in_person' && styles.radioSelected]}>
              {selectedMethod === 'in_person' && <View style={styles.radioDot} />}
            </View>
            <Text style={styles.methodEmoji}>🏟️</Text>
            <Text style={styles.methodTitle}>En persona</Text>
          </View>
          <Text style={styles.methodDescription}>
            Paga directamente en la cancha el día del partido. Tu lugar queda reservado como pendiente.
          </Text>
        </TouchableOpacity>

        <View style={[styles.methodCard, styles.methodCardDisabled]}>
          <View style={styles.methodHeader}>
            <View style={styles.radio} />
            <Text style={styles.methodEmoji}>📱</Text>
            <Text style={[styles.methodTitle, styles.methodTitleDisabled]}>Pago en app</Text>
            <View style={styles.comingSoonBadge}>
              <Text style={styles.comingSoonText}>Próximamente</Text>
            </View>
          </View>
          <Text style={[styles.methodDescription, styles.methodDescriptionDisabled]}>
            Paga de forma segura desde la app con tarjeta o transferencia.
          </Text>
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[
            styles.ctaButton,
            (!selectedMethod || selectedMethod !== 'in_person' || screenState === 'confirming') && styles.ctaDisabled,
          ]}
          onPress={handleConfirm}
          disabled={!selectedMethod || selectedMethod !== 'in_person' || screenState === 'confirming'}
          activeOpacity={0.8}
        >
          {screenState === 'confirming' ? (
            <ActivityIndicator color={colors.accentFg} />
          ) : (
            <Text style={styles.ctaButtonText}>
              {selectedMethod === 'in_person'
                ? `Confirmar · ${formatPrice(matchSummary.price_per_player)}`
                : 'Selecciona un método de pago'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
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
    paddingHorizontal: spacing.xxl,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  summaryCard: {
    backgroundColor: colors.card,
    borderRadius: radius.cardLg,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  summaryLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.dim,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  summarySport: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
    letterSpacing: -0.3,
  },
  summaryField: {
    fontSize: 14,
    color: colors.mute,
    marginBottom: 2,
  },
  summaryDate: {
    fontSize: 13,
    color: colors.dim,
    marginBottom: spacing.md,
  },
  summaryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.md,
  },
  summaryPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: -0.4,
  },
  summarySlots: {
    fontSize: 13,
    color: colors.mute,
    fontWeight: '500',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  methodCard: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: colors.line,
    gap: spacing.sm,
  },
  methodCardSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(212,255,58,0.04)',
  },
  methodCardDisabled: {
    opacity: 0.5,
  },
  methodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  methodEmoji: {
    fontSize: 18,
  },
  methodTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },
  methodTitleDisabled: {
    color: colors.dim,
  },
  methodDescription: {
    fontSize: 13,
    color: colors.mute,
    lineHeight: 18,
    marginLeft: 30,
  },
  methodDescriptionDisabled: {
    color: colors.dim,
  },
  comingSoonBadge: {
    backgroundColor: colors.card2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.badge,
  },
  comingSoonText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.dim,
  },
  errorBox: {
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  errorBoxText: {
    fontSize: 14,
    color: colors.error,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
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
  bottomBar: {
    paddingHorizontal: spacing.xl,
    paddingBottom: 34,
    paddingTop: spacing.md,
    backgroundColor: colors.bg2,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  ctaButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: {
    backgroundColor: colors.card2,
  },
  ctaButtonText: {
    color: colors.accentFg,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  successContainer: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: spacing.lg,
  },
  successIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  successIconText: {
    fontSize: 32,
    color: colors.accentFg,
    fontWeight: '800',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  successSubtitle: {
    fontSize: 14,
    color: colors.mute,
    textAlign: 'center',
    lineHeight: 20,
  },
  successCard: {
    backgroundColor: colors.card,
    borderRadius: radius.cardLg,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.line,
    width: '100%',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
  },
  successSport: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.2,
  },
  successField: {
    fontSize: 14,
    color: colors.mute,
  },
  successDate: {
    fontSize: 13,
    color: colors.dim,
  },
  successPrice: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.accent,
    marginTop: spacing.sm,
    letterSpacing: -0.4,
  },
  homeButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: 'center',
    width: '100%',
    marginTop: spacing.sm,
  },
  homeButtonText: {
    color: colors.accentFg,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
