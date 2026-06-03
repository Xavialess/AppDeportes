'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  userId: string;
  initialMerchantId: string;
  initialPhone: string;
}

export function DeunaSettingsForm({ userId, initialMerchantId, initialPhone }: Props) {
  const [merchantId, setMerchantId] = useState(initialMerchantId);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedId = merchantId.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedId || !trimmedPhone) {
      setError('Ambos campos son obligatorios.');
      return;
    }
    setSaving(true);
    setError(null);
    setSaved(false);

    const supabase = createClient();
    const { error: err } = await supabase
      .from('owner_profiles')
      .update({ deuna_merchant_id: trimmedId, deuna_phone_linked: trimmedPhone })
      .eq('user_id', userId);

    setSaving(false);
    if (err) {
      setError('No se pudo guardar. Intenta de nuevo.');
    } else {
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px 14px',
    borderRadius: 8,
    border: '1px solid var(--color-line2)',
    background: 'var(--color-card2)',
    color: 'var(--color-text)',
    fontSize: 14,
    fontWeight: 500,
    outline: 'none',
    boxSizing: 'border-box',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: 11,
    fontWeight: 600,
    color: 'var(--color-dim)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: 6,
  };

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div>
        <label htmlFor="merchantId" style={labelStyle}>ID de comercio De Una</label>
        <input
          id="merchantId"
          type="text"
          value={merchantId}
          onChange={(e) => setMerchantId(e.target.value)}
          placeholder="merchant_xxxxxxxxx"
          autoComplete="off"
          spellCheck={false}
          style={inputStyle}
        />
      </div>

      <div>
        <label htmlFor="phone" style={labelStyle}>Teléfono De Una</label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+593991234567"
          style={inputStyle}
        />
      </div>

      {error ? (
        <p style={{ fontSize: 13, color: 'var(--color-error)', margin: 0 }}>{error}</p>
      ) : null}

      {saved ? (
        <p style={{ fontSize: 13, color: '#00C6A2', fontWeight: 600, margin: 0 }}>
          ✓ Guardado correctamente
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={saving}
          style={{
            background: saving ? 'var(--color-card2)' : 'var(--color-accent)',
            color: saving ? 'var(--color-mute)' : 'var(--color-accent-fg)',
            border: 'none',
            borderRadius: 8,
            padding: '10px 28px',
            fontSize: 14,
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            letterSpacing: '-0.01em',
          }}
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  );
}
