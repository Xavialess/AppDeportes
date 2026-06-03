import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DeunaSettingsForm } from './DeunaSettingsForm';

export const metadata = { title: 'Ajustes — cancha.' };

export default async function SettingsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ownerProfile } = await supabase
    .from('owner_profiles')
    .select('deuna_merchant_id, deuna_phone_linked')
    .eq('user_id', user.id)
    .maybeSingle();

  return (
    <div style={{ maxWidth: 640, padding: '2rem' }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        Panel del propietario
      </p>
      <h1 style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text)', letterSpacing: '-0.04em', marginBottom: '2rem' }}>
        Ajustes
      </h1>

      <section>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
          <h2 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
            De Una Negocios
          </h2>
          {ownerProfile?.deuna_merchant_id && ownerProfile?.deuna_phone_linked ? (
            <span style={{
              background: '#00C6A2',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.03em',
              padding: '2px 8px',
              borderRadius: 10,
            }}>
              Activo
            </span>
          ) : null}
        </div>
        <p style={{ fontSize: 13, color: 'var(--color-mute)', marginBottom: '1rem', lineHeight: 1.5 }}>
          Tus jugadores podrán pagarte directamente con De Una. Ambos campos son obligatorios para activar el pago en app.
        </p>

        <DeunaSettingsForm
          userId={user.id}
          initialMerchantId={ownerProfile?.deuna_merchant_id ?? ''}
          initialPhone={ownerProfile?.deuna_phone_linked ?? ''}
        />
      </section>
    </div>
  );
}
