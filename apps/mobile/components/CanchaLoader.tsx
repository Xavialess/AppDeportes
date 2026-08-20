import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '../lib/theme';
import { SPORT_TILES } from '../lib/sportTiles';
import { useReducedMotion } from '../hooks/useReducedMotion';

export type CanchaLoaderVariant = 'full' | 'inline' | 'button';

interface CanchaLoaderProps {
  variant?: CanchaLoaderVariant;
}

const SIZE: Record<CanchaLoaderVariant, number> = {
  full: 56,
  inline: 32,
  button: 16,
};

// Home tile for the loader — same gradient family as the splash, just the
// first entry (fútbol) so the mark stays recognizable at a glance.
const TILE = SPORT_TILES[0];

const EDGE_COUNT = 4;
const EDGE_DURATION = 260;
const LOOP_DURATION = EDGE_COUNT * EDGE_DURATION;

/**
 * Branded loading indicator — a small rotated court tile with a lime line
 * that sweeps its four edges in sequence, instead of a generic spinner.
 * Drop-in replacement for ActivityIndicator: "full" for full-screen loads,
 * "inline" for section/list refresh, "button" for inline button spinners.
 */
export default function CanchaLoader({ variant = 'inline' }: CanchaLoaderProps) {
  const size = SIZE[variant];
  const reducedMotion = useReducedMotion();
  const progress = useRef(new Animated.Value(0)).current;
  const dotPulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reducedMotion) return;
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: EDGE_COUNT,
        duration: LOOP_DURATION,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [progress, reducedMotion]);

  useEffect(() => {
    if (variant !== 'full' || reducedMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dotPulse, { toValue: 0.4, duration: 650, useNativeDriver: true }),
        Animated.timing(dotPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [variant, dotPulse, reducedMotion]);

  const edgeOpacity = (edgeIndex: number) =>
    reducedMotion
      ? edgeIndex === 0
        ? 1
        : 0.25
      : progress.interpolate({
          inputRange: [
            edgeIndex - 1,
            edgeIndex - 0.4,
            edgeIndex,
            edgeIndex + 0.4,
            edgeIndex + 1,
          ],
          outputRange: [0.2, 0.55, 1, 0.55, 0.2],
          extrapolate: 'clamp',
        });

  return (
    <View style={styles.wrap}>
      <View style={[styles.tileWrap, { width: size, height: size, borderRadius: size / 5 }]}>
        <LinearGradient
          colors={[TILE.from, TILE.to]}
          start={{ x: 0.1, y: 0.1 }}
          end={{ x: 0.9, y: 0.9 }}
          style={StyleSheet.absoluteFill}
        />
        <Animated.View style={[styles.edgeH, { top: 0, opacity: edgeOpacity(0) }]} />
        <Animated.View style={[styles.edgeV, { right: 0, opacity: edgeOpacity(1) }]} />
        <Animated.View style={[styles.edgeH, { bottom: 0, opacity: edgeOpacity(2) }]} />
        <Animated.View style={[styles.edgeV, { left: 0, opacity: edgeOpacity(3) }]} />
      </View>

      {variant === 'full' && (
        <View style={styles.brandRow}>
          <Text style={styles.brandText}>cancha</Text>
          <Animated.Text style={[styles.brandDot, { opacity: reducedMotion ? 1 : dotPulse }]}>
            .
          </Animated.Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  tileWrap: {
    overflow: 'hidden',
  },
  edgeH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
  edgeV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: colors.accent,
  },
  brandRow: {
    flexDirection: 'row',
  },
  brandText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.display,
    color: colors.dim,
    letterSpacing: -0.2,
  },
  brandDot: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: fonts.display,
    color: colors.accent,
  },
});
