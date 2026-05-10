import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Ciudades — Admin cancha.',
};

async function createCity(formData: FormData) {
  'use server';
  const name = String(formData.get('name') ?? '').trim();
  const country_id = String(formData.get('country_id') ?? '').trim();
  if (!name || !country_id) return;
  const admin = createAdminClient();
  await admin.from('cities').insert({ name, country_id, is_active: true });
  redirect('/admin/cities');
}

async function toggleCity(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const is_active = formData.get('is_active') === 'true';
  const admin = createAdminClient();
  await admin.from('cities').update({ is_active: !is_active }).eq('id', id);
  redirect('/admin/cities');
}

export default async function CitiesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const [{ data: cities }, { data: countries }] = await Promise.all([
    admin
      .from('cities')
      .select('id, name, is_active, country_id, countries(name)')
      .order('name'),
    admin.from('countries').select('id, name').order('name'),
  ]);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Datos de referencia</span>
          <h1 className={styles.pageTitle}>Ciudades</h1>
        </div>
      </header>

      <section className={styles.formCard}>
        <p className={styles.formTitle}>Agregar ciudad</p>
        <form action={createCity} className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="name" className={styles.formLabel}>Nombre</label>
            <input id="name" name="name" className={styles.formInput} placeholder="Quito" required />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="country_id" className={styles.formLabel}>País</label>
            <select id="country_id" name="country_id" className={styles.formSelect} required>
              <option value="">Seleccionar...</option>
              {(countries ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <button type="submit" className={styles.btnPrimary}>+ Agregar</button>
        </form>
      </section>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>País</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {(cities ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className={styles.tableEmpty}>Sin ciudades registradas.</td>
              </tr>
            )}
            {(cities ?? []).map((c) => {
              const countryName = (c.countries as { name: string } | null)?.name ?? '—';
              return (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{countryName}</td>
                  <td>
                    <span className={`${styles.badge} ${c.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                      {c.is_active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>
                    <form action={toggleCity}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="is_active" value={String(c.is_active)} />
                      <button
                        type="submit"
                        className={c.is_active ? styles.btnToggleOn : styles.btnToggleOff}
                      >
                        {c.is_active ? 'Desactivar' : 'Activar'}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
