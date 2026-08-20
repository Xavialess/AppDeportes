import React from 'react';
import { StyleSheet, View } from 'react-native';

// Shared per-sport tile gradients + court-line motifs — originally built for
// the splash screen (app/index.tsx). Extracted so any other branded surface
// (e.g. CanchaLoader) draws from the same source instead of a second copy
// that can drift out of sync.

export const TILE_SIZE = 155;
export const TILE_GAP = 6;

const LINE = 'rgba(255,255,255,0.13)';
const LINE2 = 'rgba(255,255,255,0.08)';

const abs = StyleSheet.create({
  hLine:  { position: 'absolute', height: 1 },
  vLine:  { position: 'absolute', width: 1 },
  circle: { position: 'absolute', borderWidth: 1, backgroundColor: 'transparent' },
  dot:    { position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)' },
  rect:   { position: 'absolute', borderWidth: 1, backgroundColor: 'transparent' },
  netDot: { position: 'absolute', width: 5, height: 5, borderRadius: 2.5, backgroundColor: 'rgba(255,255,255,0.28)' },
});

export interface SportTileDef {
  from: string;
  to: string;
  lines: React.ReactNode;
}

const T = TILE_SIZE;

export const SPORT_TILES: SportTileDef[] = [
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
