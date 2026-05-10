import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Países — Admin cancha.',
};

async function createCountry(formData: FormData) {
  'use server';
  const name = String(formData.get('name') ?? '').trim();
  const code = String(formData.get('code') ?? '').trim().toUpperCase();
  const currency_code = String(formData.get('currency_code') ?? '').trim().toUpperCase();
  if (!name || !code || !currency_code) return;
  const admin = createAdminClient();
  await admin.from('countries').insert({ name, code, currency_code, is_active: true });
  redirect('/admin/countries');
}

async function toggleCountry(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const is_active = formData.get('is_active') === 'true';
  const admin = createAdminClient();
  await admin.from('countries').update({ is_active: !is_active }).eq('id', id);
  redirect('/admin/countries');
}

export default async function CountriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const { data: countries } = await admin
    .from('countries')
    .select('id, name, code, currency_code, is_active')
    .order('name');

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Datos de referencia</span>
          <h1 className={styles.pageTitle}>Países</h1>
        </div>
      </header>

      <section className={styles.formCard}>
        <p className={styles.formTitle}>Agregar país</p>
        <form action={createCountry} className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="name" className={styles.formLabel}>Nombre</label>
            <input id="name" name="name" className={styles.formInput} placeholder="Ecuador" required />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="code" className={styles.formLabel}>Código (ISO)</label>
            <input id="code" name="code" className={styles.formInput} placeholder="EC" maxLength={3} required />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="currency_code" className={styles.formLabel}>Moneda</label>
            <input id="currency_code" name="currency_code" className={styles.formInput} placeholder="USD" maxLength={3} required />
          </div>
          <button type="submit" className={styles.btnPrimary}>+ Agregar</button>
        </form>
      </section>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Código</th>
              <th>Moneda</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {(countries ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className={styles.tableEmpty}>Sin países registrados.</td>
              </tr>
            )}
            {(countries ?? []).map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.code}</td>
                <td>{c.currency_code}</td>
                <td>
                  <span className={`${styles.badge} ${c.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                    {c.is_active ? 'Activo' : 'Inactivo'}
                  </span>
                </td>
                <td>
                  <form action={toggleCountry}>
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
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
