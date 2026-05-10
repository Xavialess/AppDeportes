import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Deportes — Admin cancha.',
};

async function createSport(formData: FormData) {
  'use server';
  const name = String(formData.get('name') ?? '').trim();
  const icon = String(formData.get('icon') ?? '').trim();
  const formatsRaw = String(formData.get('formats') ?? '').trim();
  if (!name) return;
  const formats = formatsRaw
    ? formatsRaw.split(',').map((f) => f.trim()).filter(Boolean)
    : [];
  const admin = createAdminClient();
  await admin.from('sports').insert({ name, icon: icon || null, formats, is_active: true });
  redirect('/admin/sports');
}

async function toggleSport(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const is_active = formData.get('is_active') === 'true';
  const admin = createAdminClient();
  await admin.from('sports').update({ is_active: !is_active }).eq('id', id);
  redirect('/admin/sports');
}

export default async function SportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const { data: sports } = await admin
    .from('sports')
    .select('id, name, icon, formats, is_active')
    .order('name');

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Datos de referencia</span>
          <h1 className={styles.pageTitle}>Deportes</h1>
        </div>
      </header>

      <section className={styles.formCard}>
        <p className={styles.formTitle}>Agregar deporte</p>
        <form action={createSport} className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="name" className={styles.formLabel}>Nombre</label>
            <input id="name" name="name" className={styles.formInput} placeholder="Fútbol" required />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="icon" className={styles.formLabel}>Icono (emoji)</label>
            <input id="icon" name="icon" className={styles.formInput} placeholder="⚽" maxLength={4} />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="formats" className={styles.formLabel}>Formatos (separados por coma)</label>
            <input
              id="formats"
              name="formats"
              className={styles.formInput}
              placeholder="5v5, 7v7, 11v11"
              style={{ minWidth: '220px' }}
            />
          </div>
          <button type="submit" className={styles.btnPrimary}>+ Agregar</button>
        </form>
      </section>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Icono</th>
              <th>Nombre</th>
              <th>Formatos</th>
              <th>Estado</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {(sports ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className={styles.tableEmpty}>Sin deportes registrados.</td>
              </tr>
            )}
            {(sports ?? []).map((s) => {
              const formats = Array.isArray(s.formats) ? s.formats : [];
              return (
                <tr key={s.id}>
                  <td style={{ fontSize: '1.25rem' }}>{s.icon ?? '—'}</td>
                  <td>{s.name}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                    {formats.length > 0 ? formats.join(', ') : '—'}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${s.is_active ? styles.badgeActive : styles.badgeInactive}`}>
                      {s.is_active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <form action={toggleSport}>
                      <input type="hidden" name="id" value={s.id} />
                      <input type="hidden" name="is_active" value={String(s.is_active)} />
                      <button
                        type="submit"
                        className={s.is_active ? styles.btnToggleOn : styles.btnToggleOff}
                      >
                        {s.is_active ? 'Desactivar' : 'Activar'}
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
