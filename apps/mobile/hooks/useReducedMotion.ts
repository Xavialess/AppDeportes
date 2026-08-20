import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Tracks the OS "reduce motion" accessibility setting so decorative
 * animations (splash entrance, CanchaLoader) can snap to their end state
 * instead of tweening when the user has asked for less motion.
 */
export function useReducedMotion(): boolean {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReducedMotion,
    );

    return () => subscription.remove();
  }, []);

  return reducedMotion;
}
