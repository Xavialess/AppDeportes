import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Planes — Admin cancha.',
};

async function requireAdmin() {
  'use server';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return null;
  return user;
}

async function createPlan(formData: FormData) {
  'use server';
  if (!await requireAdmin()) return;
  const name = String(formData.get('name') ?? '').trim();
  const price = parseFloat(String(formData.get('price') ?? '0'));
  const max_matches_per_month = parseInt(String(formData.get('max_matches_per_month') ?? '0'), 10);
  if (!name || isNaN(price) || price < 0 || isNaN(max_matches_per_month) || max_matches_per_month < 1) return;
  const admin = createAdminClient();
  await admin.from('plans').insert({ name, price, max_matches_per_month });
  redirect('/admin/plans');
}

async function updatePlan(formData: FormData) {
  'use server';
  if (!await requireAdmin()) return;
  const id = formData.get('id');
  if (!id || typeof id !== 'string') return;
  const name = String(formData.get('name') ?? '').trim();
  const price = parseFloat(String(formData.get('price') ?? '0'));
  const max_matches_per_month = parseInt(String(formData.get('max_matches_per_month') ?? '0'), 10);
  if (!name || isNaN(price) || price < 0 || isNaN(max_matches_per_month) || max_matches_per_month < 1) return;
  const admin = createAdminClient();
  await admin.from('plans').update({ name, price, max_matches_per_month }).eq('id', id);
  redirect('/admin/plans');
}

interface Plan {
  id: string;
  name: string;
  price: number;
  max_matches_per_month: number;
  created_at: string;
}

export default async function PlansPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const { data: plans } = await admin
    .from('plans')
    .select('id, name, price, max_matches_per_month, created_at')
    .order('price');

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Datos de referencia</span>
          <h1 className={styles.pageTitle}>Planes</h1>
        </div>
      </header>

      <section className={styles.formCard}>
        <p className={styles.formTitle}>Nuevo plan</p>
        <form action={createPlan} className={styles.formRow}>
          <div className={styles.formGroup}>
            <label htmlFor="name" className={styles.formLabel}>Nombre</label>
            <input id="name" name="name" className={styles.formInput} placeholder="Básico" required />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="price" className={styles.formLabel}>Precio (USD/mes)</label>
            <input
              id="price"
              name="price"
              type="number"
              step="0.01"
              min="0"
              className={styles.formInput}
              placeholder="19.99"
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="max_matches_per_month" className={styles.formLabel}>Partidos/mes</label>
            <input
              id="max_matches_per_month"
              name="max_matches_per_month"
              type="number"
              min="1"
              className={styles.formInput}
              placeholder="10"
              required
            />
          </div>
          <button type="submit" className={styles.btnPrimary}>+ Agregar</button>
        </form>
      </section>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Precio / mes</th>
              <th>Partidos / mes</th>
              <th>Editar</th>
            </tr>
          </thead>
          <tbody>
            {(plans ?? []).length === 0 && (
              <tr>
                <td colSpan={4} className={styles.tableEmpty}>Sin planes registrados.</td>
              </tr>
            )}
            {(plans ?? []).map((p: Plan) => (
              <tr key={p.id}>
                <td style={{ fontWeight: 600 }}>{p.name}</td>
                <td>${p.price.toFixed(2)}</td>
                <td style={{ textAlign: 'center' }}>{p.max_matches_per_month}</td>
                <td>
                  <form action={updatePlan} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <input type="hidden" name="id" value={p.id} />
                    <input
                      name="name"
                      defaultValue={p.name}
                      className={styles.formInput}
                      style={{ width: 110 }}
                      required
                    />
                    <input
                      name="price"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={p.price}
                      className={styles.formInput}
                      style={{ width: 80 }}
                      required
                    />
                    <input
                      name="max_matches_per_month"
                      type="number"
                      min="1"
                      defaultValue={p.max_matches_per_month}
                      className={styles.formInput}
                      style={{ width: 64 }}
                      required
                    />
                    <button type="submit" className={styles.btnToggleOff}>
                      Guardar
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
