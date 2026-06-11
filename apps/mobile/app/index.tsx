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

const T = 155; // tile size px
const G = 6;   // gap px
const COLS = 3;
const ROWS = 6;

const LINE  = 'rgba(255,255,255,0.13)';
const LINE2 = 'rgba(255,255,255,0.08)';

const abs = StyleSheet.create({
  hLine:  { position: 'absolute', height: 1 },
  vLine:  { position: 'absolute', width: 1 },
  circle: { position: 'absolute', borderWidth: 1, backgroundColor: 'transparent' },
  dot:    { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  rect:   { position: 'absolute', borderWidth: 1, backgroundColor: 'transparent' },
  netDot: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.28)' },
});

type SportDef = { from: string; to: string; lines: React.ReactNode };

const SPORTS: SportDef[] = [
  {
    from: '#1a3a2a', to: '#0f1f15', // Fútbol
    lines: (
      <>
        <View style={[abs.hLine, { top: T / 2, left: 0, right: 0, backgroundColor: LINE }]} />
        <View style={[abs.circle, { width: 44, height: 44, borderRadius: 22, top: T / 2 - 22, left: T / 2 - 22, borderColor: LINE }]} />
        <View style={[abs.dot, { top: T / 2 - 3, left: T / 2 - 3 }]} />
        <View style={[abs.rect, { top: 10, left: T / 2 - 26, width: 52, height: 18, borderColor: LINE2 }]} />
        <View style={[abs.rect, { bottom: 10, left: T / 2 - 26, width: 52, height: 18, borderColor: LINE2 }]} />
      </>
    ),
  },
  {
    from: '#1a2a3a', to: '#0f151f', // Pádel
    lines: (
      <>
        <View style={[abs.rect, { top: 12, left: 12, right: 12, bottom: 12, borderColor: LINE }]} />
        <View style={[abs.hLine, { top: T / 2, left: 12, right: 12, height: 2, backgroundColor: LINE }]} />
        <View style={[abs.hLine, { top: 40, left: 12, right: 12, backgroundColor: LINE2 }]} />
        <View style={[abs.hLine, { bottom: 40, left: 12, right: 12, backgroundColor: LINE2 }]} />
        <View style={[abs.vLine, { top: 40, bottom: 40, left: T / 2, backgroundColor: LINE2 }]} />
        <View style={[abs.netDot, { top: T / 2 - 2.5, left: 8 }]} />
        <View style={[abs.netDot, { top: T / 2 - 2.5, right: 8 }]} />
      </>
    ),
  },
  {
    from: '#3a2f1a', to: '#1f180f', // Tenis
    lines: (
      <>
        <View style={[abs.rect, { top: 10, left: 18, right: 18, bottom: 10, borderColor: LINE }]} />
        <View style={[abs.hLine, { top: T / 2, left: 18, right: 18, height: 2, backgroundColor: LINE }]} />
        <View style={[abs.hLine, { top: 34, left: 18, right: 18, backgroundColor: LINE2 }]} />
        <View style={[abs.hLine, { bottom: 34, left: 18, right: 18, backgroundColor: LINE2 }]} />
        <View style={[abs.vLine, { top: 34, bottom: 34, left: T / 2, backgroundColor: LINE2 }]} />
        <View style={[abs.netDot, { top: T / 2 - 2.5, left: 14 }]} />
        <View style={[abs.netDot, { top: T / 2 - 2.5, right: 14 }]} />
      </>
    ),
  },
  {
    from: '#3a1a1a', to: '#1f0f0f', // Básquet
    lines: (
      <>
        <View style={[abs.rect, { top: 12, left: 12, right: 12, bottom: 12, borderColor: LINE }]} />
        <View style={[abs.vLine, { top: 12, bottom: 12, left: T / 2, backgroundColor: LINE }]} />
        <View style={[abs.circle, { width: 36, height: 36, borderRadius: 18, top: T / 2 - 18, left: T / 2 - 18, borderColor: LINE2 }]} />
        <View style={[abs.rect, { top: 12, left: T / 2 - 26, width: 52, height: 40, borderColor: LINE2 }]} />
        <View style={[abs.circle, { width: 30, height: 30, borderRadius: 15, top: 40, left: T / 2 - 15, borderColor: LINE2 }]} />
        <View style={[abs.rect, { top: 12, left: T / 2 - 10, width: 20, height: 4, borderColor: LINE }]} />
      </>
    ),
  },
  {
    from: '#2a1a3a', to: '#150f1f', // Vóley
    lines: (
      <>
        <View style={[abs.rect, { top: 12, left: 12, right: 12, bottom: 12, borderColor: LINE }]} />
        <View style={[abs.hLine, { top: T / 2, left: 12, right: 12, height: 2, backgroundColor: LINE }]} />
        <View style={[abs.hLine, { top: 28, left: 12, right: 12, backgroundColor: LINE2 }]} />
        <View style={[abs.hLine, { bottom: 28, left: 12, right: 12, backgroundColor: LINE2 }]} />
        <View style={[abs.circle, { width: 48, height: 48, borderRadius: 24, top: T / 2 - 24, left: T / 2 - 24, borderColor: LINE2 }]} />
        <View style={[abs.netDot, { top: T / 2 - 2.5, left: 8 }]} />
        <View style={[abs.netDot, { top: T / 2 - 2.5, right: 8 }]} />
      </>
    ),
  },
  {
    from: '#0f2a3a', to: '#08151f', // Natación
    lines: (
      <>
        <View style={[abs.rect, { top: 10, left: 10, right: 10, bottom: 10, borderColor: LINE }]} />
        {[30, 52, 74, 96, 118].map((y) => (
          <View key={y} style={[abs.hLine, { top: y, left: 10, right: 10, backgroundColor: LINE2 }]} />
        ))}
        <View style={[abs.vLine, { top: 10, bottom: 10, left: 22, backgroundColor: LINE2 }]} />
        <View style={[abs.vLine, { top: 10, bottom: 10, right: 22, backgroundColor: LINE2 }]} />
      </>
    ),
  },
];

function SportTile({ sport }: { sport: SportDef }) {
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

export default function AppSplash() {
  const insets = useSafeAreaInsets();
  const { session, loading } = useSession();

  // Refs so animation callback and session effect always see current values
  const destination  = useRef<string | null>(null);
  const animDone     = useRef(false);
  const hasNavigated = useRef(false);

  const tilesOpacity   = useRef(new Animated.Value(0)).current;
  const brandOpacity   = useRef(new Animated.Value(0)).current;
  const brandY         = useRef(new Animated.Value(14)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY       = useRef(new Animated.Value(10)).current;

  // Hide the native splash only after our screen has actually painted (onLayout below)
  // — avoids the black flash that happens when hideAsync runs before first paint

  // Both paths call this — whichever arrives second triggers navigation
  function maybeNavigate() {
    if (hasNavigated.current || !animDone.current || !destination.current) return;
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

  // Entrance animations — try to navigate when done
  useEffect(() => {
    Animated.timing(tilesOpacity, {
      toValue: 1, duration: 900, delay: 100, useNativeDriver: true,
    }).start();

    Animated.parallel([
      Animated.timing(brandOpacity, { toValue: 1, duration: 500, delay: 700, useNativeDriver: true }),
      Animated.timing(brandY,       { toValue: 0, duration: 500, delay: 700, useNativeDriver: true }),
    ]).start();

    Animated.parallel([
      Animated.timing(taglineOpacity, { toValue: 1, duration: 500, delay: 950, useNativeDriver: true }),
      Animated.timing(taglineY,       { toValue: 0, duration: 500, delay: 950, useNativeDriver: true }),
    ]).start(() => {
      animDone.current = true;
      maybeNavigate();
    });
  }, []);

  const tiles = Array.from({ length: COLS * ROWS }, (_, i) => SPORTS[i % SPORTS.length]);

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
    backgroundColor: '#0a0a0a',
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
    letterSpacing: -0.5,
    color: '#fafafa',
    textAlign: 'center',
    includeFontPadding: false,
  },
  brandDot: {
    color: '#d4ff3a',
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
