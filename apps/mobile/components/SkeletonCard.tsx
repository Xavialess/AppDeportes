import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { colors, radius } from '../lib/theme';

interface SkeletonCardProps {
  index?: number;
}

export default function SkeletonCard({ index = 0 }: SkeletonCardProps) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const delay = index * 80;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(shimmer, {
          toValue: 1,
          duration: 900,
          useNativeDriver: true,
        }),
        Animated.timing(shimmer, {
          toValue: 0,
          duration: 900,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [shimmer, index]);

  const opacity = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 0.8],
  });

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Animated.View style={[styles.pillSm, { opacity }]} />
        <Animated.View style={[styles.pillXs, { opacity }]} />
      </View>
      <Animated.View style={[styles.line, styles.lineLg, { opacity }]} />
      <Animated.View style={[styles.line, styles.lineMd, { opacity }]} />
      <View style={styles.footer}>
        <Animated.View style={[styles.pillSm, { opacity }]} />
        <Animated.View style={[styles.pillXs, { opacity }]} />
      </View>
    </View>
  );
}

const SHIMMER = colors.line;

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.card,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 10,
    gap: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  line: {
    height: 12,
    borderRadius: radius.badge,
    backgroundColor: SHIMMER,
  },
  lineLg: { width: '70%' },
  lineMd: { width: '45%' },
  pillSm: {
    height: 22,
    width: 80,
    borderRadius: radius.xs,
    backgroundColor: SHIMMER,
  },
  pillXs: {
    height: 22,
    width: 55,
    borderRadius: radius.xs,
    backgroundColor: SHIMMER,
  },
});
