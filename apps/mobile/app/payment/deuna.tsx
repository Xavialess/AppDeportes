/*
 * Payment screen — De Una QR
 *
 * Route: /payment/deuna?enrollmentId=<uuid>
 *
 * Flow:
 *   1. On mount: call create-deuna-payment Edge Function → get QR
 *   2. Show QR image + "Abrir De Una" deep-link CTA + countdown timer
 *   3. Poll enrollments.status every 5s; AppState listener re-polls on foreground
 *   4. "Verificar pago" manual button shown after 10s
 *   5. On status='confirmed' → success; on expiry/cancellation → retry prompt
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  AppState,
  AppStateStatus,
  Linking,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../lib/theme';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ScreenState = 'loading' | 'qr' | 'success' | 'expired' | 'error';

interface QRData {
  qr_base64: string;
  payment_url: string;
  payment_intent_id: string;
  expires_at: string;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function DeunaPaymentScreen() {
  const { enrollmentId } = useLocalSearchParams<{ enrollmentId: string }>();

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [showVerify, setShowVerify] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const pollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appStateRef  = useRef<AppStateStatus>('active');

  const stopTimers = useCallback(() => {
    if (pollRef.current)      clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current);
  }, []);

  // ── Init ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!enrollmentId) {
      setErrorMessage('Inscripción no encontrada.');
      setScreenState('error');
      return;
    }
    createPaymentIntent();

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      stopTimers();
      sub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollmentId]);

  // ── AppState: re-poll immediately when user returns from De Una app ────
  function handleAppStateChange(next: AppStateStatus) {
    if (appStateRef.current.match(/inactive|background/) && next === 'active') {
      pollOnce();
    }
    appStateRef.current = next;
  }

  // ── Edge Function call ─────────────────────────────────────────────────
  async function createPaymentIntent() {
    setScreenState('loading');
    try {
      const { data, error } = await supabase.functions.invoke('create-deuna-payment', {
        body: { enrollment_id: enrollmentId },
      });

      if (error) {
        const code = (error as any)?.context?.error ?? 'unknown_error';
        handleEdgeFunctionError(code);
        return;
      }

      const qr = data as QRData;
      setQrData(qr);
      setScreenState('qr');
      startCountdown(qr.expires_at);
      startPolling();
      verifyTimerRef.current = setTimeout(() => setShowVerify(true), 10_000);
    } catch {
      setErrorMessage('No se pudo conectar con el servidor. Intenta de nuevo.');
      setScreenState('error');
    }
  }

  // ── Countdown ──────────────────────────────────────────────────────────
  function startCountdown(expiresAt: string) {
    const expiryMs = new Date(expiresAt).getTime();
    const tick = () => {
      const left = Math.max(0, Math.floor((expiryMs - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left === 0) {
        stopTimers();
        setScreenState('expired');
      }
    };
    tick();
    countdownRef.current = setInterval(tick, 1000);
  }

  // ── Polling ────────────────────────────────────────────────────────────
  function startPolling() {
    pollRef.current = setInterval(pollOnce, 5_000);
  }

  async function pollOnce() {
    if (!enrollmentId) return;
    const { data } = await supabase
      .from('enrollments')
      .select('status')
      .eq('id', enrollmentId)
      .single();

    if (!data) return;

    if (data.status === 'confirmed') {
      stopTimers();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setScreenState('success');
    } else if (data.status === 'cancelled' || data.status === 'refunded') {
      stopTimers();
      setErrorMessage('El pago no fue procesado. Tu inscripción ha sido cancelada.');
      setScreenState('expired');
    }
  }

  // ── Manual verify ──────────────────────────────────────────────────────
  async function handleVerify() {
    setVerifying(true);
    await pollOnce();
    setVerifying(false);
  }

  // ── Error mapping ──────────────────────────────────────────────────────
  function handleEdgeFunctionError(code: string) {
    const messages: Record<string, string> = {
      already_paid:                'Ya tienes un pago confirmado para este partido.',
      enrollment_not_active:       'Tu inscripción ya no está activa.',
      match_not_enrollable:        'Este partido ya no acepta inscripciones.',
      no_price_set:                'Este partido no tiene precio definido.',
      owner_deuna_not_configured:  'El dueño de la cancha aún no tiene De Una configurado.',
      payment_already_in_progress: 'Ya tienes un pago en progreso.',
      deuna_api_error:             'El servicio de pagos no está disponible. Intenta en unos minutos.',
    };
    setErrorMessage(messages[code] ?? 'No se pudo iniciar el pago. Intenta de nuevo.');
    setScreenState('error');
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const stackOptions = {
    headerShown: true,
    title: 'Pagar con De Una',
    headerStyle: { backgroundColor: colors.bg },
    headerTintColor: colors.text,
    headerShadowVisible: false,
    headerBackVisible: screenState !== 'qr',
  };

  // ── Loading ───────────────────────────────────────────────────────────
  if (screenState === 'loading') {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={stackOptions} />
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Generando código QR…</Text>
      </View>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────
  if (screenState === 'error') {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={stackOptions} />
        <Text style={styles.stateIcon}>⚠️</Text>
        <Text style={styles.stateTitle}>Algo salió mal</Text>
        <Text style={styles.stateSubtitle}>{errorMessage}</Text>
        <TouchableOpacity style={styles.actionButton} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.actionButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────
  if (screenState === 'success') {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ ...stackOptions, headerBackVisible: false }} />
        <View style={styles.successIcon}>
          <Text style={styles.successIconText}>✓</Text>
        </View>
        <Text style={styles.stateTitle}>¡Pago confirmado!</Text>
        <Text style={styles.stateSubtitle}>Tu cupo está reservado. Nos vemos en la cancha.</Text>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => router.replace('/(tabs)/' as any)}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>Volver al inicio</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Expired / cancelled ────────────────────────────────────────────────
  if (screenState === 'expired') {
    return (
      <View style={styles.centered}>
        <Stack.Screen options={{ ...stackOptions, headerBackVisible: false }} />
        <Text style={styles.stateIcon}>⏱️</Text>
        <Text style={styles.stateTitle}>
          {errorMessage ? 'Pago no completado' : 'Código expirado'}
        </Text>
        <Text style={styles.stateSubtitle}>
          {errorMessage ?? 'El código QR ha expirado. Intenta de nuevo.'}
        </Text>
        <TouchableOpacity style={styles.actionButton} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.actionButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── QR screen ─────────────────────────────────────────────────────────
  const minutes   = Math.floor(secondsLeft / 60);
  const secs      = secondsLeft % 60;
  const timerStr  = `${minutes}:${String(secs).padStart(2, '0')}`;
  const timerUrgent = secondsLeft < 60;

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Stack.Screen options={stackOptions} />

      <Text style={styles.instructionTitle}>Escanea el código QR</Text>
      <Text style={styles.instructionSubtitle}>
        Abre la app de De Una y escanea para completar tu pago, o toca "Abrir De Una".
      </Text>

      {/* QR image */}
      <View style={styles.qrContainer}>
        {qrData?.qr_base64 ? (
          <Image
            source={{ uri: `data:image/png;base64,${qrData.qr_base64}` }}
            style={styles.qrImage}
            resizeMode="contain"
          />
        ) : (
          <View style={styles.qrPlaceholder}>
            <ActivityIndicator color={colors.accent} />
          </View>
        )}
      </View>

      {/* Open De Una deep link */}
      {qrData?.payment_url ? (
        <TouchableOpacity
          style={styles.openDeunaButton}
          onPress={() => Linking.openURL(qrData.payment_url)}
          activeOpacity={0.85}
        >
          <Text style={styles.openDeunaText}>Abrir De Una</Text>
        </TouchableOpacity>
      ) : null}

      {/* Timer */}
      <View style={styles.timerRow}>
        <Text style={styles.timerLabel}>Vence en</Text>
        <Text style={[styles.timerValue, timerUrgent && styles.timerUrgent]}>{timerStr}</Text>
      </View>

      {/* De Una badge */}
      <View style={styles.deunaBadge}>
        <Text style={styles.deunaBadgeText}>Powered by De Una</Text>
      </View>

      {/* Waiting + Verificar */}
      <View style={styles.waitingRow}>
        <ActivityIndicator size="small" color={colors.dim} />
        <Text style={styles.waitingText}>Esperando confirmación…</Text>
      </View>

      {showVerify ? (
        <TouchableOpacity
          style={styles.verifyButton}
          onPress={handleVerify}
          disabled={verifying}
          activeOpacity={0.8}
        >
          {verifying ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : (
            <Text style={styles.verifyText}>Verificar pago</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  scrollContent: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: 48,
    gap: spacing.lg,
  },
  centered: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.dim,
    marginTop: spacing.sm,
  },
  instructionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  instructionSubtitle: {
    fontSize: 14,
    color: colors.mute,
    textAlign: 'center',
    lineHeight: 20,
  },
  qrContainer: {
    backgroundColor: '#fff',
    borderRadius: radius.cardLg,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
    marginVertical: spacing.sm,
  },
  qrImage: {
    width: 240,
    height: 240,
  },
  qrPlaceholder: {
    width: 240,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  openDeunaButton: {
    backgroundColor: '#00C6A2',
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
  },
  openDeunaText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  timerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timerLabel: {
    fontSize: 14,
    color: colors.mute,
  },
  timerValue: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
  timerUrgent: {
    color: colors.error,
  },
  deunaBadge: {
    backgroundColor: '#00C6A2',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.badge,
  },
  deunaBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
    letterSpacing: 0.3,
  },
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  waitingText: {
    fontSize: 13,
    color: colors.dim,
  },
  verifyButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 32,
    minWidth: 160,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  verifyText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.accent,
  },
  stateIcon: {
    fontSize: 48,
    marginBottom: spacing.sm,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  successIconText: {
    fontSize: 36,
    color: colors.accentFg,
    fontWeight: '800',
  },
  stateTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  stateSubtitle: {
    fontSize: 14,
    color: colors.mute,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  actionButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 40,
    marginTop: spacing.md,
  },
  actionButtonText: {
    color: colors.accentFg,
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
});
