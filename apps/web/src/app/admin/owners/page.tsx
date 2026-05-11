import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Propietarios — Admin cancha.',
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

async function assignPlan(formData: FormData) {
  'use server';
  if (!await requireAdmin()) return;
  const owner_profile_id = formData.get('owner_profile_id');
  if (!owner_profile_id || typeof owner_profile_id !== 'string') return;
  const plan_id = formData.get('plan_id');
  const admin = createAdminClient();
  await admin
    .from('owner_profiles')
    .update({ plan_id: plan_id && typeof plan_id === 'string' && plan_id !== '' ? plan_id : null })
    .eq('id', owner_profile_id);
  redirect('/admin/owners');
}

async function toggleSubscription(formData: FormData) {
  'use server';
  if (!await requireAdmin()) return;
  const owner_profile_id = formData.get('owner_profile_id');
  if (!owner_profile_id || typeof owner_profile_id !== 'string') return;
  const admin = createAdminClient();
  const { data: current } = await admin
    .from('owner_profiles')
    .select('subscription_status')
    .eq('id', owner_profile_id)
    .single();
  if (!current) return;
  const new_status = current.subscription_status === 'active' ? 'inactive' : 'active';
  await admin
    .from('owner_profiles')
    .update({ subscription_status: new_status })
    .eq('id', owner_profile_id);
  redirect('/admin/owners');
}

interface Plan {
  id: string;
  name: string;
  price: number;
  max_matches_per_month: number;
}

interface OwnerRow {
  id: string;
  user_id: string;
  subscription_status: string | null;
  cancellation_count: number | null;
  plan_id: string | null;
  plans: Plan | null;
  users: { name: string | null; email: string } | null;
}

export default async function OwnersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const [{ data: owners }, { data: plans }] = await Promise.all([
    admin
      .from('owner_profiles')
      .select('id, user_id, subscription_status, cancellation_count, plan_id, plans(id, name, price, max_matches_per_month), users(name, email)')
      .order('user_id'),
    admin.from('plans').select('id, name, price, max_matches_per_month').order('price'),
  ]);

  const plansList = (plans ?? []) as Plan[];

  const statusBadgeClass = (status: string) =>
    status === 'active'
      ? styles.badgeActive
      : status === 'cancelled'
      ? styles.badgeCancelled
      : styles.badgeInactive;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Supervisión</span>
          <h1 className={styles.pageTitle}>Propietarios</h1>
        </div>
      </header>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Plan asignado</th>
              <th>Suscripción</th>
              <th>Cancelaciones</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {(owners ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className={styles.tableEmpty}>Sin propietarios registrados.</td>
              </tr>
            )}
            {(owners ?? []).map((o) => {
              const ownerRow = o as unknown as OwnerRow;
              const ownerUser = ownerRow.users;
              const currentPlan = ownerRow.plans;
              const status = ownerRow.subscription_status ?? 'inactive';

              return (
                <tr key={ownerRow.id}>
                  <td style={{ fontWeight: 600 }}>{ownerUser?.name ?? '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                    {ownerUser?.email ?? '—'}
                  </td>

                  {/* Plan assignment */}
                  <td>
                    <form action={assignPlan} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="hidden" name="owner_profile_id" value={ownerRow.id} />
                      <select
                        name="plan_id"
                        defaultValue={ownerRow.plan_id ?? ''}
                        className={styles.formSelect}
                        style={{ minWidth: 140 }}
                      >
                        <option value="">Sin plan</option>
                        {plansList.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} · ${p.price}/mes
                          </option>
                        ))}
                      </select>
                      <button type="submit" className={styles.btnToggleOff}>
                        Asignar
                      </button>
                    </form>
                  </td>

                  {/* Subscription status */}
                  <td>
                    <span className={`${styles.badge} ${statusBadgeClass(status)}`}>{status}</span>
                  </td>

                  {/* Cancellation count */}
                  <td style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: (ownerRow.cancellation_count ?? 0) >= 3 ? 'var(--color-error)' : 'var(--color-text)',
                      }}
                    >
                      {ownerRow.cancellation_count ?? 0}
                    </span>
                  </td>

                  {/* Toggle subscription */}
                  <td>
                    <form action={toggleSubscription}>
                      <input type="hidden" name="owner_profile_id" value={ownerRow.id} />
                      <input type="hidden" name="current_status" value={status} />
                      <button
                        type="submit"
                        className={status === 'active' ? styles.btnToggleOn : styles.btnToggleOff}
                        disabled={!ownerRow.plan_id}
                        title={!ownerRow.plan_id ? 'Asigna un plan primero' : undefined}
                      >
                        {status === 'active' ? 'Desactivar' : 'Activar'}
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
