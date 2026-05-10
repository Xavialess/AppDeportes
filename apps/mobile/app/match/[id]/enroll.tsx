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

function formatPrice(price: number | null): string {
  if (price == null) return '—';
  return `$${price.toFixed(2)}`;
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

    // Check if match is still available
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
        // Duplicate key = already enrolled
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

  // ---- render: loading
  if (screenState === 'loading') {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Inscripción' }} />
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  // ---- render: error
  if (screenState === 'error' || !matchSummary) {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ title: 'Inscripción' }} />
        <Text style={styles.errorText}>{errorMessage ?? 'Algo salió mal.'}</Text>
        <TouchableOpacity onPress={loadMatchSummary} style={styles.retryButton}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---- render: success
  if (screenState === 'success') {
    return (
      <View style={styles.successContainer}>
        <Stack.Screen options={{ title: 'Confirmación' }} />
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.successTitle}>¡Inscripción confirmada!</Text>
        <Text style={styles.successSubtitle}>
          Te has inscrito en el partido. Recuerda llevar el pago el día del partido.
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

  // ---- render: select / confirming
  const slotsLeft = matchSummary.max_players != null
    ? matchSummary.max_players - matchSummary.enrolled_count
    : null;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Método de pago' }} />

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

        {/* Error message */}
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorBoxText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Payment method selection */}
        <Text style={styles.sectionTitle}>¿Cómo quieres pagar?</Text>

        {/* Option: In person */}
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

        {/* Option: In app (coming soon) */}
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

      {/* Bottom CTA */}
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
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.ctaButtonText}>
              {selectedMethod === 'in_person'
                ? `Confirmar inscripción · ${formatPrice(matchSummary.price_per_player)}`
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
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 24,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
    gap: 16,
  },

  // Summary card
  summaryCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  summarySport: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 2,
  },
  summaryField: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 2,
  },
  summaryDate: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 12,
  },
  summaryFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  summaryPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: '#16a34a',
  },
  summarySlots: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '500',
  },

  // Section title
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },

  // Method cards
  methodCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    gap: 10,
  },
  methodCardSelected: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  methodCardDisabled: {
    opacity: 0.6,
    backgroundColor: '#f8f9fa',
  },
  methodHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: '#16a34a',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16a34a',
  },
  methodEmoji: {
    fontSize: 20,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  methodTitleDisabled: {
    color: '#9ca3af',
  },
  methodDescription: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 18,
    marginLeft: 30,
  },
  methodDescriptionDisabled: {
    color: '#9ca3af',
  },
  comingSoonBadge: {
    backgroundColor: '#f3f4f6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  comingSoonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6b7280',
  },

  // Error
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    padding: 14,
  },
  errorBoxText: {
    fontSize: 14,
    color: '#dc2626',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 15,
    color: '#dc2626',
    textAlign: 'center',
    marginBottom: 16,
  },
  retryButton: {
    backgroundColor: '#dc2626',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 12,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
  },
  ctaButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaDisabled: {
    backgroundColor: '#9ca3af',
  },
  ctaButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },

  // Success
  successContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 16,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successIconText: {
    fontSize: 36,
    color: '#ffffff',
    fontWeight: '800',
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0f172a',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 14,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 20,
  },
  successCard: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 20,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    width: '100%',
    alignItems: 'center',
    gap: 4,
    marginTop: 8,
  },
  successSport: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0f172a',
  },
  successField: {
    fontSize: 14,
    color: '#374151',
  },
  successDate: {
    fontSize: 13,
    color: '#64748b',
  },
  successPrice: {
    fontSize: 22,
    fontWeight: '800',
    color: '#16a34a',
    marginTop: 8,
  },
  homeButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 40,
    alignItems: 'center',
    width: '100%',
    marginTop: 8,
  },
  homeButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
