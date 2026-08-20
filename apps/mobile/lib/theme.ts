export const colors = {
  bg:      '#0a0a0a',
  bg2:     '#121212',
  card:    '#171717',
  card2:   '#1f1f1f',
  line:    'rgba(255,255,255,0.07)',
  line2:   'rgba(255,255,255,0.12)',
  text:    '#fafafa',
  mute:    'rgba(255,255,255,0.55)',
  dim:     'rgba(255,255,255,0.32)',
  accent:  '#d4ff3a',
  accentFg: '#0a0a0a',
  accentDim: 'rgba(212,255,58,0.55)',
  error:   '#f87171',
  errorBg: 'rgba(248,113,113,0.08)',
  errorBorder: 'rgba(248,113,113,0.25)',
  success: '#34d399',
  // Second brand accent (was already reused informally for "confirmed"
  // badges and co-player avatars) — formalized so it isn't the app's only
  // decorative color outside lime.
  accentSecondary: '#60a5fa',
  // Third-party payment provider brand mark — never reused decoratively.
  deunaBrand: '#00C6A2',
} as const;

// Typography scale — sizes were previously 19 distinct inlined values with
// no shared name. Not every screen needs to migrate at once; new/updated
// text styles should start from these.
export const typography = {
  display: 42,
  h1: 30,
  h2: 22,
  h3: 18,
  body: 15,
  bodySm: 14,
  caption: 13,
  label: 11,
  micro: 10,
} as const;

export const weight = {
  medium: '500',
  semibold: '600',
  bold: '700',
  black: '800',
} as const;

// Display typeface — loaded via useFonts() in app/_layout.tsx (see
// @expo-google-fonts/archivo). Reserved for the brand wordmark and screen
// titles only; body text stays on the system font.
export const fonts = {
  display: 'Archivo_800ExtraBold',
} as const;

// Single source of truth for match-status badge colors — owner and player
// screens previously each declared their own copy, and they had drifted
// (e.g. en_curso rendered amber on owner screens, orange on player screens).
export const matchStatus = {
  open:      { bg: 'rgba(212,255,58,0.1)',  text: colors.accent },
  confirmed: { bg: 'rgba(96,165,250,0.1)',  text: '#60a5fa' },
  en_curso:  { bg: 'rgba(251,191,36,0.12)', text: '#fbbf24' },
  jugado:    { bg: 'rgba(52,211,153,0.1)',  text: colors.success },
  completed: { bg: 'rgba(52,211,153,0.1)',  text: colors.success },
  cancelled: { bg: colors.errorBg,          text: colors.error },
} as const;

export const radius = {
  xs: 8,
  badge: 6,
  card:  14,
  cardLg: 18,
  pill:  999,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  page: 20,
} as const;

// Elevation is used sparingly and only for genuinely floating UI (FABs,
// bottom sheets, modals). Everything else stays flat/bordered by design.
export const shadow = {
  floating: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  subtle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
} as const;
