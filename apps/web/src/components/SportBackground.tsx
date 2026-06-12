import styles from './SportBackground.module.css';

const T = 140;
const GAP = 6;
const COLS = 14;
const ROWS = 9;

const LINE  = 'rgba(255,255,255,0.2)';
const LINE2 = 'rgba(255,255,255,0.11)';
const hw = T / 2;

const SPORTS = [
  {
    id: 'futbol',
    from: '#224d38',
    to: '#122a1e',
    lines: (
      <svg viewBox={`0 0 ${T} ${T}`} aria-hidden focusable="false" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <line x1="0" y1={hw} x2={T} y2={hw} stroke={LINE} strokeWidth="1" />
        <circle cx={hw} cy={hw} r="22" fill="none" stroke={LINE} strokeWidth="1" />
        <circle cx={hw} cy={hw} r="3" fill="rgba(255,255,255,0.22)" />
        <rect x={hw - 26} y="10" width="52" height="18" fill="none" stroke={LINE2} strokeWidth="1" />
        <rect x={hw - 26} y={T - 28} width="52" height="18" fill="none" stroke={LINE2} strokeWidth="1" />
      </svg>
    ),
  },
  {
    id: 'padel',
    from: '#1e3a50',
    to: '#101f2b',
    lines: (
      <svg viewBox={`0 0 ${T} ${T}`} aria-hidden focusable="false" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect x="12" y="12" width={T - 24} height={T - 24} fill="none" stroke={LINE} strokeWidth="1" />
        <line x1="12" y1={hw} x2={T - 12} y2={hw} stroke={LINE} strokeWidth="2" />
        <line x1="12" y1="40" x2={T - 12} y2="40" stroke={LINE2} strokeWidth="1" />
        <line x1="12" y1={T - 40} x2={T - 12} y2={T - 40} stroke={LINE2} strokeWidth="1" />
        <line x1={hw} y1="40" x2={hw} y2={T - 40} stroke={LINE2} strokeWidth="1" />
        <circle cx="8" cy={hw} r="2.5" fill="rgba(255,255,255,0.28)" />
        <circle cx={T - 8} cy={hw} r="2.5" fill="rgba(255,255,255,0.28)" />
      </svg>
    ),
  },
  {
    id: 'tenis',
    from: '#4a3c1e',
    to: '#271f10',
    lines: (
      <svg viewBox={`0 0 ${T} ${T}`} aria-hidden focusable="false" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect x="18" y="10" width={T - 36} height={T - 20} fill="none" stroke={LINE} strokeWidth="1" />
        <line x1="18" y1={hw} x2={T - 18} y2={hw} stroke={LINE} strokeWidth="2" />
        <line x1="18" y1="34" x2={T - 18} y2="34" stroke={LINE2} strokeWidth="1" />
        <line x1="18" y1={T - 34} x2={T - 18} y2={T - 34} stroke={LINE2} strokeWidth="1" />
        <line x1={hw} y1="34" x2={hw} y2={T - 34} stroke={LINE2} strokeWidth="1" />
        <circle cx="14" cy={hw} r="2.5" fill="rgba(255,255,255,0.28)" />
        <circle cx={T - 14} cy={hw} r="2.5" fill="rgba(255,255,255,0.28)" />
      </svg>
    ),
  },
  {
    id: 'basquet',
    from: '#4a1e1e',
    to: '#281010',
    lines: (
      <svg viewBox={`0 0 ${T} ${T}`} aria-hidden focusable="false" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect x="12" y="12" width={T - 24} height={T - 24} fill="none" stroke={LINE} strokeWidth="1" />
        <line x1={hw} y1="12" x2={hw} y2={T - 12} stroke={LINE} strokeWidth="1" />
        <circle cx={hw} cy={hw} r="18" fill="none" stroke={LINE2} strokeWidth="1" />
        <rect x={hw - 26} y="12" width="52" height="40" fill="none" stroke={LINE2} strokeWidth="1" />
        <circle cx={hw} cy="52" r="15" fill="none" stroke={LINE2} strokeWidth="1" />
        <rect x={hw - 10} y="12" width="20" height="4" fill="none" stroke={LINE} strokeWidth="1" />
      </svg>
    ),
  },
  {
    id: 'voley',
    from: '#361e4a',
    to: '#1c1028',
    lines: (
      <svg viewBox={`0 0 ${T} ${T}`} aria-hidden focusable="false" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect x="12" y="12" width={T - 24} height={T - 24} fill="none" stroke={LINE} strokeWidth="1" />
        <line x1="12" y1={hw} x2={T - 12} y2={hw} stroke={LINE} strokeWidth="2" />
        <line x1="12" y1="28" x2={T - 12} y2="28" stroke={LINE2} strokeWidth="1" />
        <line x1="12" y1={T - 28} x2={T - 12} y2={T - 28} stroke={LINE2} strokeWidth="1" />
        <circle cx={hw} cy={hw} r="24" fill="none" stroke={LINE2} strokeWidth="1" />
        <circle cx="8" cy={hw} r="2.5" fill="rgba(255,255,255,0.28)" />
        <circle cx={T - 8} cy={hw} r="2.5" fill="rgba(255,255,255,0.28)" />
      </svg>
    ),
  },
  {
    id: 'natacion',
    from: '#103850',
    to: '#081e2a',
    lines: (
      <svg viewBox={`0 0 ${T} ${T}`} aria-hidden focusable="false" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
        <rect x="10" y="10" width={T - 20} height={T - 20} fill="none" stroke={LINE} strokeWidth="1" />
        {[30, 52, 74, 96, 118].map((y) => (
          <line key={y} x1="10" y1={y} x2={T - 10} y2={y} stroke={LINE2} strokeWidth="1" />
        ))}
        <line x1="22" y1="10" x2="22" y2={T - 10} stroke={LINE2} strokeWidth="1" />
        <line x1={T - 22} y1="10" x2={T - 22} y2={T - 10} stroke={LINE2} strokeWidth="1" />
      </svg>
    ),
  },
] as const;

const TILES = Array.from({ length: COLS * ROWS }, (_, i) => SPORTS[i % SPORTS.length]);

export function SportBackground() {
  return (
    <div className={styles.wrap} aria-hidden="true">
      <div
        className={styles.grid}
        style={{
          gridTemplateColumns: `repeat(${COLS}, ${T}px)`,
          gap: GAP,
        }}
      >
        {TILES.map((sport, i) => (
          <div
            key={i}
            className={styles.tile}
            style={{ background: `linear-gradient(135deg, ${sport.from}, ${sport.to})` }}
          >
            {sport.lines}
          </div>
        ))}
      </div>

      <div className={styles.vigTop} />
      <div className={styles.vigBottom} />
      <div className={styles.vigLeft} />
      <div className={styles.vigRight} />
      <div className={styles.vigCenter} />
    </div>
  );
}
