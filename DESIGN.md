# cancha. — Design System

> The visual identity for the cancha. sports booking app.
> Pure black background, electric lime accent, Space Grotesk display type.

---

## Brand

**Name:** cancha. (lowercase, dot is part of the name — rendered in accent color)

```
cancha<span color=accent>.</span>
```

The dot is always rendered in the active accent color. Never omit it.

---

## Color Tokens

### Background surfaces

| Token | Value | Use |
|-------|-------|-----|
| `bg` | `#0a0a0a` | Page / screen background |
| `bg2` | `#121212` | Secondary background (map overlays, modals) |
| `card` | `#171717` | Cards, input fields |
| `card2` | `#1f1f1f` | Nested surfaces, hover states |

### Text

| Token | Value | Use |
|-------|-------|-----|
| `text` | `#fafafa` | Primary text |
| `mute` | `rgba(255,255,255,0.55)` | Secondary text, labels |
| `dim` | `rgba(255,255,255,0.32)` | Tertiary text, placeholders, icons |

### Borders

| Token | Value | Use |
|-------|-------|-----|
| `line` | `rgba(255,255,255,0.07)` | Subtle card borders |
| `line2` | `rgba(255,255,255,0.12)` | Stronger dividers, active outlines |

### Accent palette

| Value | Name | Use |
|-------|------|-----|
| `#d4ff3a` | Electric lime (default) | CTAs, active states, brand dot |
| `#ff5a1f` | Ember | — |
| `#60a5fa` | Sky | — |
| `#a78bfa` | Violet | — |
| `#34d399` | Mint | — |

**Rule:** accent text/icons always sit on `#0a0a0a` — the lime is bright enough that dark text is always legible on it.

### Sport field tints (for FieldStripe backgrounds)

| Sport | Gradient |
|-------|----------|
| fútbol | `#1a3a2a` → `#0f1f15` |
| pádel | `#1a2a3a` → `#0f151f` |
| tenis | `#3a2f1a` → `#1f180f` |
| básquet | `#3a1a1a` → `#1f0f0f` |

---

## Typography

Three font stacks, each with a distinct role:

| Role | Stack | Use |
|------|-------|-----|
| Display | `"Space Grotesk", -apple-system, system-ui, sans-serif` | Headings, brand mark, card titles, prices |
| Mono | `"Geist Mono", "JetBrains Mono", ui-monospace, monospace` | Timestamps, stats, distances, sport labels, price suffixes |
| Body | `-apple-system, "SF Pro Text", system-ui, sans-serif` | Body copy, labels, nav items |

### Scale (Mobile)

| Use | Size | Weight | Notes |
|-----|------|--------|-------|
| Brand mark | 26px | 700 | Display font |
| Screen title | 22–26px | 700 | Display, tracking −0.5 |
| Card title | 16–18px | 600 | Display |
| Body | 13–15px | 400–500 | Body |
| Labels / caps | 9–11px | 600 | Mono, letter-spacing +0.3–0.5 |
| Prices | 17–18px | 700 | Display |
| Stat numbers | 24–28px | 700 | Display or Mono |

### Loading (Web)

Add to `<head>`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600;700&display=swap" rel="stylesheet">
```

---

## Spacing & Radii

| Purpose | Value |
|---------|-------|
| Screen horizontal padding | 20px |
| Card border radius | 14–18px |
| Chip / pill border radius | 999px (fully round) |
| Icon button border radius | 50% |
| Small badge border radius | 6px |
| Card internal padding | 12–14px |
| Section gap | 10–14px |
| Inter-card gap | 12px |

---

## Elevation

Elevation is achieved through background color stepping, not box shadows:

```
bg (#0a0a0a) → card (#171717) → card2 (#1f1f1f)
```

Shadows are used only for avatar stack rings (0 0 0 2px [ring] , 0 0 0 4px [bg]).

---

## Components

### Brand Mark

```
cancha<accent-dot>.
```

- Font: Space Grotesk, 700
- Text color: `text` (`#fafafa`)
- Dot color: accent (`#d4ff3a` default)
- Letter spacing: −0.5

### Pill (filter chip)

- Height: 34px, padding: 0 14px
- Inactive: `background: rgba(255,255,255,0.06)`, text `#fafafa`
- Active: `background: accent`, text `#0a0a0a`
- Font: body, 13px, weight 600
- Border radius: 999
- Transition: all 150ms

### Avatar

- Circle with colored background and initials
- Font: Space Grotesk, weight 600
- Text color: `#0a0a0a` (dark on colored bg)
- Ring: `0 0 0 2px [ring-color], 0 0 0 4px [bg]` (used in stacked avatar rows)

### EmptySlot

- Dashed circle border in accent color
- "+" glyph in accent color
- Used to show open player spots

### FieldStripe (match card hero)

- Abstract diagonal stripe pattern over sport-tinted gradient
- Faint white field marking lines (0.18 opacity)
- Height: 92px in cards, 260px in detail hero
- Overlaid with time/status badges using backdrop-blur glass effect

### Match Card

- Background: `card` with `line` border, 18px radius
- FieldStripe hero at top
- Overlaid: time badge (left, glass) + slots badge (right, accent bg)
- Body: venue name, distance, city/level, player avatars, price per player

### Info Grid Cell

```
[MONO LABEL 9px]
[Display value 18px bold]
[Body sub 11px muted]
```

Background: `card`, border `line`, radius 14px, padding 12×14px.

### Progress Bar

- Track: `card2`, height 4px, full radius
- Fill: accent, animated width

### Glass Badge / Pill

Used over images/dark backgrounds:
```css
background: rgba(0,0,0,0.55);
backdrop-filter: blur(8-10px);
border-radius: 6px;
padding: 4px 8px;
```
Font: Geist Mono, 10px, weight 600–700, letter-spacing 0.3.

### CTA Button (primary)

- Background: accent (`#d4ff3a`)
- Text: `#0a0a0a`, Space Grotesk, 16–17px, weight 700
- Border radius: 14px
- Height: 52–56px
- No border
- Transition: opacity 150ms
- Loading state: `opacity: 0.6`, with spinner

### Secondary / Ghost Button

- Background: `card2`
- Text: `text`
- Border radius: 14px

### Tab Bar (mobile)

- Position: absolute bottom, full width
- Background: gradient `rgba(10,10,10,1) 60% → transparent` (fade upward)
- Bottom padding: 28px (iOS home indicator)
- Icons: 22px SVG, active = accent, inactive = `dim`
- Labels: 10px, body font, weight 600
- 4 tabs: Inicio, Buscar, Mis partidos, Perfil

### Nav Header (mobile)

- Greeting text: 11px, `dim`, uppercase, letter-spacing 0.4
- Brand mark below
- Notification bell icon button: 38px circle, `card` bg, `line` border
- Notification dot: accent, 8px circle, `bg` ring

### Back Button (mobile)

- 38px circle, `rgba(0,0,0,0.55)` with backdrop-blur (on hero images)
- or `card` with `line` border (on plain backgrounds)
- Chevron left SVG icon

---

## Motion

| Interaction | Duration | Easing |
|-------------|----------|--------|
| Pill active state | 150ms | ease |
| CTA press | 150ms | ease |
| Loading state enter | 150ms | ease |
| Screen transition | 250ms | ease-in-out |
| Payment loading | 1200ms | (async) |

Keep all animations on compositor-friendly properties: `opacity`, `transform`, `background-color`.

---

## Sport Iconography

Simple geometric glyphs — no photorealistic icons:

| Sport | Glyph | Format |
|-------|-------|--------|
| Fútbol | ⬡ | 5v5 |
| Pádel | ◇ | 2v2 |
| Tenis | ◯ | 1v1 |
| Básquet | △ | 3v3 |

---

## Web CSS Variables

```css
:root {
  /* backgrounds */
  --color-bg: #0a0a0a;
  --color-bg2: #121212;
  --color-card: #171717;
  --color-card2: #1f1f1f;

  /* borders */
  --color-line: rgba(255, 255, 255, 0.07);
  --color-line2: rgba(255, 255, 255, 0.12);

  /* text */
  --color-text: #fafafa;
  --color-mute: rgba(255, 255, 255, 0.55);
  --color-dim: rgba(255, 255, 255, 0.32);

  /* accent */
  --color-accent: #d4ff3a;
  --color-accent-fg: #0a0a0a;

  /* typography */
  --font-display: "Space Grotesk", -apple-system, system-ui, sans-serif;
  --font-mono: "Geist Mono", "JetBrains Mono", ui-monospace, monospace;
  --font-body: -apple-system, "SF Pro Text", system-ui, sans-serif;

  /* radii */
  --radius-card: 14px;
  --radius-card-lg: 18px;
  --radius-pill: 999px;
  --radius-badge: 6px;

  /* spacing */
  --space-page: 20px;
}
```

---

## Mobile StyleSheet Tokens

```ts
export const colors = {
  bg: '#0a0a0a',
  bg2: '#121212',
  card: '#171717',
  card2: '#1f1f1f',
  line: 'rgba(255,255,255,0.07)',
  line2: 'rgba(255,255,255,0.12)',
  text: '#fafafa',
  mute: 'rgba(255,255,255,0.55)',
  dim: 'rgba(255,255,255,0.32)',
  accent: '#d4ff3a',
  accentFg: '#0a0a0a',
} as const;

export const fonts = {
  display: 'SpaceGrotesk-Bold',
  displayMedium: 'SpaceGrotesk-SemiBold',
  mono: 'GeistMono-Regular',
  monoBold: 'GeistMono-Bold',
} as const;

export const radius = {
  card: 14,
  cardLg: 18,
  pill: 999,
  badge: 6,
} as const;
```

---

## Decisions Log

| Decision | Rationale |
|----------|-----------|
| Pure black `#0a0a0a` background | More premium than dark navy; higher contrast against lime accent |
| Electric lime `#d4ff3a` as default accent | High energy, distinctive, reads well on pure black |
| Accent text always `#0a0a0a` | Lime is bright — dark text maintains legibility at all sizes |
| Space Grotesk for display | Geometric, modern, strong weight contrast, works at large sizes |
| Geist Mono for data | Mechanical precision feel for timestamps, stats, distances |
| No drop shadows for elevation | Elevation through background stepping keeps UI clean on black |
| FieldStripe instead of photos | No image CDN dependency; sport-tinted, always loads instantly |
| Geometric sport glyphs | Simple, scalable, no icon font dependency |
| Backdrop-blur glass badges over images | Legible on any field color; premium feel |
| Tab bar as gradient fade, not solid bar | Seamless blend with list content scrolling beneath it |
