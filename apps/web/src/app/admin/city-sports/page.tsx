import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Ciudad–Deporte — Admin cancha.',
};

async function toggleCitySport(formData: FormData) {
  'use server';
  const city_id = String(formData.get('city_id'));
  const sport_id = String(formData.get('sport_id'));
  const existing_id = String(formData.get('existing_id') ?? '');
  const is_active = formData.get('is_active') === 'true';
  const admin = createAdminClient();

  if (existing_id) {
    await admin.from('city_sports').update({ is_active: !is_active }).eq('id', existing_id);
  } else {
    await admin.from('city_sports').insert({ city_id, sport_id, is_active: true });
  }
  redirect('/admin/city-sports');
}

interface CitySportRow {
  id: string;
  city_id: string;
  sport_id: string;
  is_active: boolean;
}

export default async function CitySportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const [{ data: cities }, { data: sports }, { data: citySports }] = await Promise.all([
    admin.from('cities').select('id, name, is_active').order('name'),
    admin.from('sports').select('id, name, icon, is_active').order('name'),
    admin.from('city_sports').select('id, city_id, sport_id, is_active'),
  ]);

  // Build a lookup map: `${city_id}:${sport_id}` → citySport row
  const lookup = new Map<string, CitySportRow>();
  for (const cs of citySports ?? []) {
    lookup.set(`${cs.city_id}:${cs.sport_id}`, cs as CitySportRow);
  }

  const activeCities = (cities ?? []).filter((c) => c.is_active);
  const activeSports = (sports ?? []).filter((s) => s.is_active);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Datos de referencia</span>
          <h1 className={styles.pageTitle}>Ciudad–Deporte</h1>
        </div>
      </header>

      <p style={{ marginBottom: 'var(--space-4)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        Activa o desactiva la combinación ciudad × deporte. Solo se muestran ciudades y deportes marcados como activos.
      </p>

      <div className={styles.matrixWrapper}>
        <table className={styles.matrixTable}>
          <thead>
            <tr>
              <th>Ciudad</th>
              {activeSports.map((s) => (
                <th key={s.id} title={s.name}>
                  {s.icon ?? ''} {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeCities.length === 0 && (
              <tr>
                <td colSpan={activeSports.length + 1} className={styles.tableEmpty}>
                  Sin ciudades activas.
                </td>
              </tr>
            )}
            {activeCities.map((city) => (
              <tr key={city.id}>
                <td>{city.name}</td>
                {activeSports.map((sport) => {
                  const key = `${city.id}:${sport.id}`;
                  const entry = lookup.get(key);
                  const isEnabled = entry?.is_active ?? false;
                  return (
                    <td key={sport.id}>
                      <form action={toggleCitySport} style={{ display: 'inline' }}>
                        <input type="hidden" name="city_id" value={city.id} />
                        <input type="hidden" name="sport_id" value={sport.id} />
                        <input type="hidden" name="existing_id" value={entry?.id ?? ''} />
                        <input type="hidden" name="is_active" value={String(isEnabled)} />
                        <button
                          type="submit"
                          title={isEnabled ? 'Desactivar' : 'Activar'}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '1rem',
                            lineHeight: 1,
                            opacity: isEnabled ? 1 : 0.25,
                            transition: 'opacity 150ms',
                          }}
                          aria-label={`${isEnabled ? 'Desactivar' : 'Activar'} ${sport.name} en ${city.name}`}
                        >
                          {isEnabled ? '✓' : '○'}
                        </button>
                      </form>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
