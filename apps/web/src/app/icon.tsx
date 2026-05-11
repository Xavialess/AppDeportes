import { ImageResponse } from 'next/og';

export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: '#0d2a1e',
          borderRadius: 7,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {/* Field glyph mark */}
        <svg width="22" height="22" viewBox="0 0 100 100" fill="none">
          <rect x="8" y="14" width="84" height="72" rx="3" stroke="#f6fff0" strokeWidth="5" opacity="0.9" />
          <line x1="50" y1="14" x2="50" y2="86" stroke="#f6fff0" strokeWidth="5" opacity="0.9" />
          <circle cx="50" cy="50" r="15" stroke="#f6fff0" strokeWidth="5" opacity="0.9" />
          <circle cx="50" cy="50" r="4" fill="#d4ff3a" />
          <path d="M8 14 q6 0 6 6" stroke="#d4ff3a" strokeWidth="5" fill="none" />
          <path d="M92 86 q-6 0 -6 -6" stroke="#d4ff3a" strokeWidth="5" fill="none" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
