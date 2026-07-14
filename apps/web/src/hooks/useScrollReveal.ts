'use client';

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';
import { loadGsap } from '@/lib/gsap';

interface ScrollRevealOptions {
  y?: number;
  duration?: number;
  stagger?: number;
  start?: string;
}

export function useScrollReveal<T extends HTMLElement>(
  itemsSelector: string,
  options: ScrollRevealOptions = {},
): RefObject<T | null> {
  const containerRef = useRef<T>(null);
  const { y = 24, duration = 0.6, stagger = 0.12, start = 'top 80%' } = options;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let mm: { add: (query: string, callback: () => void) => void; revert: () => void } | undefined;
    let cancelled = false;

    void (async () => {
      const gsap = await loadGsap();
      if (cancelled) return;

      mm = gsap.matchMedia();

      mm.add('(prefers-reduced-motion: no-preference)', () => {
        const items = container.querySelectorAll(itemsSelector);
        gsap.set(items, { opacity: 0, y });
        gsap.to(items, {
          opacity: 1,
          y: 0,
          duration,
          stagger,
          ease: 'power2.out',
          scrollTrigger: {
            trigger: container,
            start,
            once: true,
          },
        });
      });

      mm.add('(prefers-reduced-motion: reduce)', () => {
        const items = container.querySelectorAll(itemsSelector);
        gsap.set(items, { opacity: 1, y: 0 });
      });
    })();

    return () => {
      cancelled = true;
      mm?.revert();
    };
  }, [itemsSelector, y, duration, stagger, start]);

  return containerRef;
}
