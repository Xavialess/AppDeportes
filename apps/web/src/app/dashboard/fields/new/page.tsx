import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import styles from '../fields.module.css';

export const metadata: Metadata = { title: 'Registrar cancha — cancha.' };

async function createField(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const name = formData.get('name') as string;
  const address = formData.get('address') as string;
  const cityId = formData.get('city_id') as string;
  const latitude = parseFloat(formData.get('latitude') as string) || 0;
  const longitude = parseFloat(formData.get('longitude') as string) || 0;

  const { error } = await supabase.from('fields').insert({
    owner_id: user.id,
    city_id: cityId,
    name: name.trim(),
    address: address.trim(),
    latitude,
    longitude,
    images: [],
  });

  if (error) {
    redirect(`/dashboard/fields/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/fields');
  redirect('/dashboard/fields');
}

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

export default async function NewFieldPage({ searchParams }: PageProps) {
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

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
          <h1 className={styles.pageTitle}>Registrar cancha</h1>
        </div>
      </header>

      <div className={styles.formCard}>
        <form action={createField}>
          <div className={styles.formGrid}>
            {error && (
              <div className={styles.errorBanner} role="alert">{error}</div>
            )}

            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="name">Nombre de la cancha</label>
              <input
                id="name"
                name="name"
                type="text"
                className={styles.input}
                placeholder="Cancha El Batán"
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
            <Link href="/dashboard/fields" className={styles.cancelBtn}>
              Cancelar
            </Link>
            <button type="submit" className={styles.submitBtn}>
              Registrar cancha
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
