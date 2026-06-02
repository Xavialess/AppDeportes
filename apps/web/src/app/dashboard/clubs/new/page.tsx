import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import styles from '../../fields/fields.module.css';

export const metadata: Metadata = { title: 'Registrar complejo — cancha.' };

async function createClub(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Re-verify role server-side
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    redirect('/login?error=unauthorized');
  }

  const name = (formData.get('name') as string).trim();
  const address = (formData.get('address') as string).trim();
  const cityId = formData.get('city_id') as string;
  const description = (formData.get('description') as string | null)?.trim() || null;
  const latitude = parseFloat(formData.get('latitude') as string) || null;
  const longitude = parseFloat(formData.get('longitude') as string) || null;

  const { error } = await supabase.from('clubs').insert({
    owner_id: user.id,
    city_id: cityId,
    name,
    address,
    description,
    latitude,
    longitude,
    images: [],
    is_active: true,
  });

  if (error) {
    redirect(`/dashboard/clubs/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/clubs');
  redirect('/dashboard/clubs');
}

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewClubPage({ searchParams }: PageProps) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    redirect('/login?error=unauthorized');
  }

  const { data: cities } = await supabase
    .from('cities')
    .select('id, name, countries(name)')
    .eq('is_active', true)
    .order('name');

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Gestión</span>
          <h1 className={styles.pageTitle}>Registrar complejo</h1>
        </div>
        <Link href="/dashboard/clubs" className={styles.cancelBtn}>
          ← Mis Complejos
        </Link>
      </header>

      <div className={styles.formCard}>
        <form action={createClub}>
          <div className={styles.formGrid}>
            {error && (
              <div className={styles.errorBanner} role="alert">{error}</div>
            )}

            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="name">Nombre del complejo</label>
              <input
                id="name"
                name="name"
                type="text"
                className={styles.input}
                placeholder="Complejo Deportivo El Batán"
                required
                autoFocus
              />
            </div>

            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="address">Dirección</label>
              <input
                id="address"
                name="address"
                type="text"
                className={styles.input}
                placeholder="Av. 6 de Diciembre y Colón, Quito"
                required
              />
            </div>

            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="city_id">Ciudad</label>
              <select id="city_id" name="city_id" className={styles.select} required>
                {(cities ?? []).map((city) => {
                  const country = city.countries as { name: string } | null;
                  return (
                    <option key={city.id} value={city.id}>
                      {city.name}{country ? ` (${country.name})` : ''}
                    </option>
                  );
                })}
              </select>
              {(!cities || cities.length === 0) && (
                <p className={styles.hint}>
                  No hay ciudades activas. Pide al administrador que active una ciudad primero.
                </p>
              )}
            </div>

            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="description">Descripción (opcional)</label>
              <input
                id="description"
                name="description"
                type="text"
                className={styles.input}
                placeholder="Canchas de fútbol y básquet con estacionamiento"
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="latitude">Latitud</label>
              <input
                id="latitude"
                name="latitude"
                type="number"
                step="0.000001"
                min="-90"
                max="90"
                className={styles.input}
                placeholder="-0.180653"
                defaultValue=""
              />
              <p className={styles.hint}>Opcional — para futuras funciones de mapa.</p>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.label} htmlFor="longitude">Longitud</label>
              <input
                id="longitude"
                name="longitude"
                type="number"
                step="0.000001"
                min="-180"
                max="180"
                className={styles.input}
                placeholder="-78.467834"
                defaultValue=""
              />
            </div>
          </div>

          <div className={styles.formFooter}>
            <Link href="/dashboard/clubs" className={styles.cancelBtn}>
              Cancelar
            </Link>
            <button type="submit" className={styles.submitBtn}>
              Registrar complejo
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
