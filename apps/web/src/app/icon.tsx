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
          background: '#0a0a0a',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Stylized triangle logomark with lime accent dot */}
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
          <path
            d="M11 3L19 19H3L11 3Z"
            stroke="#d4ff3a"
            strokeWidth="2"
            strokeLinejoin="round"
            fill="none"
          />
          <circle cx="11" cy="13" r="2" fill="#d4ff3a" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
