import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useSession } from '../hooks/useSession';
import { supabase } from '../lib/supabase';
import { colors, fonts } from '../lib/theme';
import { SPORT_TILES, TILE_SIZE, TILE_GAP, type SportTileDef } from '../lib/sportTiles';
import { useReducedMotion } from '../hooks/useReducedMotion';

const T = TILE_SIZE;
const G = TILE_GAP;
const COLS = 3;
const ROWS = 6;

function SportTile({ sport }: { sport: SportTileDef }) {
  return (
    <LinearGradient
      colors={[sport.from, sport.to]}
      start={{ x: 0.1, y: 0.1 }}
      end={{ x: 0.9, y: 0.9 }}
      style={s.tile}
    >
      {sport.lines}
    </LinearGradient>
  );
}

type UserRole = 'player' | 'owner' | 'admin';

// Minimum time the splash stays on screen — just enough for the brand mark
// to register on a fast session resolution, without gating navigation on
// the full decorative animation (which keeps playing independently and
// simply gets cut short by the navigation-triggered unmount when it does).
const MIN_DISPLAY_MS = 400;

export default function AppSplash() {
  const insets = useSafeAreaInsets();
  const { session, loading } = useSession();
  const reducedMotion = useReducedMotion();

  // Refs so animation callback and session effect always see current values
  const destination    = useRef<string | null>(null);
  const minTimeElapsed  = useRef(false);
  const hasNavigated    = useRef(false);

  const tilesOpacity   = useRef(new Animated.Value(0)).current;
  const brandOpacity   = useRef(new Animated.Value(0)).current;
  const brandY         = useRef(new Animated.Value(14)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY       = useRef(new Animated.Value(10)).current;

  // Hide the native splash only after our screen has actually painted (onLayout below)
  // — avoids the black flash that happens when hideAsync runs before first paint

  // Both paths call this — whichever arrives second triggers navigation
  function maybeNavigate() {
    if (hasNavigated.current || !minTimeElapsed.current || !destination.current) return;
    hasNavigated.current = true;
    router.replace(destination.current as never);
  }

  // Resolve destination as soon as session is known, then try to navigate
  useEffect(() => {
    if (loading) return;
    if (!session) {
      destination.current = '/(auth)/login';
      maybeNavigate();
      return;
    }
    supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        const role = (!error && data?.role) as UserRole | false;
        destination.current = role === 'player'
          ? '/(tabs)/'
          : role === 'owner' || role === 'admin'
          ? '/(owner)/'
          : '/(auth)/login';
        maybeNavigate();
      });
  }, [session, loading]);

  // Decorative entrance animation — purely visual, does not gate navigation.
  // Respects reduced-motion by snapping straight to the end state.
  useEffect(() => {
    if (reducedMotion) {
      tilesOpacity.setValue(1);
      brandOpacity.setValue(1);
      brandY.setValue(0);
      taglineOpacity.setValue(1);
      taglineY.setValue(0);
      return;
    }

    Animated.timing(tilesOpacity, {
      toValue: 1, duration: 600, delay: 60, useNativeDriver: true,
    }).start();

    Animated.parallel([
      Animated.timing(brandOpacity, { toValue: 1, duration: 380, delay: 380, useNativeDriver: true }),
      Animated.timing(brandY,       { toValue: 0, duration: 380, delay: 380, useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.timing(taglineOpacity, { toValue: 1, duration: 380, delay: 520, useNativeDriver: true }),
      Animated.timing(taglineY,       { toValue: 0, duration: 380, delay: 520, useNativeDriver: true }),
    ]).start();
  }, [reducedMotion]);

  // Navigation is gated on a short minimum display time instead of the full
  // decorative animation, so a fast session resolution doesn't sit and wait
  // out branding it doesn't need to.
  useEffect(() => {
    const t = setTimeout(() => {
      minTimeElapsed.current = true;
      maybeNavigate();
    }, MIN_DISPLAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tiles = Array.from({ length: COLS * ROWS }, (_, i) => SPORT_TILES[i % SPORT_TILES.length]);

  return (
    <View style={s.screen} onLayout={() => void SplashScreen.hideAsync()}>
      {/* Rotated sport field tile grid */}
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: tilesOpacity }]} pointerEvents="none">
        <View style={s.tilesGrid}>
          {Array.from({ length: ROWS }, (_, row) => (
            <View key={row} style={s.tilesRow}>
              {Array.from({ length: COLS }, (_, col) => (
                <SportTile key={col} sport={tiles[row * COLS + col]} />
              ))}
            </View>
          ))}
        </View>
      </Animated.View>

      {/* Vignettes */}
      <LinearGradient
        colors={['rgba(10,10,10,0.75)', 'transparent']}
        style={[StyleSheet.absoluteFill, { bottom: '60%' }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', 'rgba(10,10,10,0.9)']}
        style={[StyleSheet.absoluteFill, { top: '40%' }]}
        pointerEvents="none"
      />
      <View style={s.centerOverlay} pointerEvents="none" />

      {/* Brand */}
      <View style={s.center}>
        <Animated.Text
          style={[s.brandName, { opacity: brandOpacity, transform: [{ translateY: brandY }] }]}
        >
          {'cancha'}<Text style={s.brandDot}>.</Text>
        </Animated.Text>

        <Animated.Text
          style={[s.tagline, { opacity: taglineOpacity, transform: [{ translateY: taglineY }] }]}
        >
          TU PRÓXIMO PARTIDO EMPIEZA ACÁ
        </Animated.Text>
      </View>

      {/* Version — pinned to bottom */}
      <View style={[s.versionWrap, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <Animated.Text style={[s.version, { opacity: taglineOpacity }]}>
          v 1.0.0 · ec
        </Animated.Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
    overflow: 'hidden',
  },
  tilesGrid: {
    position: 'absolute',
    top: -80,
    left: -80,
    gap: G,
    transform: [{ rotate: '-8deg' }],
  },
  tilesRow: {
    flexDirection: 'row',
    gap: G,
    marginBottom: G,
  },
  tile: {
    width: T,
    height: T,
    borderRadius: 18,
    overflow: 'hidden',
  },
  centerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(10,10,10,0.52)',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 12,
  },
  brandName: {
    fontSize: 42,
    fontWeight: '700',
    fontFamily: fonts.display,
    letterSpacing: -0.5,
    color: colors.text,
    textAlign: 'center',
    includeFontPadding: false,
  },
  brandDot: {
    color: colors.accent,
  },
  tagline: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 3.5,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  versionWrap: {
    alignItems: 'center',
  },
  version: {
    fontSize: 10,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.28)',
    letterSpacing: 0.5,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
