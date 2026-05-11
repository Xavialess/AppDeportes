import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default async function AppleIcon() {
  const fontData = await fetch(
    'https://fonts.gstatic.com/s/spacegrotesk/v22/V8mQoQDjQSkFtoMM3T6r8E7mF71Q-gOoraIAEj4PVksj.ttf',
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: '#0d2a1e',
          borderRadius: 40,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {/* Field texture */}
        <svg
          width="180"
          height="180"
          viewBox="0 0 1024 1024"
          style={{ position: 'absolute', top: 0, left: 0, opacity: 0.06 }}
        >
          <rect x="80" y="200" width="864" height="624" fill="none" stroke="#f6fff0" strokeWidth="3" />
          <line x1="512" y1="200" x2="512" y2="824" stroke="#f6fff0" strokeWidth="3" />
          <circle cx="512" cy="512" r="110" fill="none" stroke="#f6fff0" strokeWidth="3" />
        </svg>
        {/* Wordmark */}
        <div
          style={{
            display: 'flex',
            fontFamily: 'Space Grotesk',
            fontWeight: 700,
            fontSize: 42,
            letterSpacing: -2,
            color: '#f6fff0',
            position: 'relative',
          }}
        >
          cancha
          <span style={{ color: '#d4ff3a' }}>.</span>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: 'Space Grotesk', data: fontData, weight: 700 }],
    },
  );
}
