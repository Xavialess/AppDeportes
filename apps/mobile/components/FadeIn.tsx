import { useEffect, useRef } from 'react';
import { Animated, StyleProp, ViewStyle } from 'react-native';
import { useReducedMotion } from '../hooks/useReducedMotion';

interface FadeInProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
}

/**
 * Fades its children in on mount — used when resolved list/detail content
 * replaces a skeleton or loader, so the swap isn't a hard visual cut.
 */
export default function FadeIn({ children, style, duration = 200 }: FadeInProps) {
  const reducedMotion = useReducedMotion();
  const opacity = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;

  useEffect(() => {
    if (reducedMotion) return;
    Animated.timing(opacity, {
      toValue: 1,
      duration,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Animated.View style={[{ opacity }, style]}>{children}</Animated.View>;
}
