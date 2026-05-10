import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Propietarios — Admin cancha.',
};

export default async function OwnersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const { data: owners } = await admin
    .from('owner_profiles')
    .select(`
      id,
      user_id,
      subscription_status,
      cancellation_count,
      plans(name, price, max_matches_per_month),
      users(name, email)
    `)
    .order('user_id');

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
              <th>Plan</th>
              <th>Estado suscripción</th>
              <th>Cancelaciones</th>
            </tr>
          </thead>
          <tbody>
            {(owners ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className={styles.tableEmpty}>Sin propietarios registrados.</td>
              </tr>
            )}
            {(owners ?? []).map((o) => {
              const ownerUser = o.users as { name: string | null; email: string } | null;
              const plan = o.plans as { name: string; price: number; max_matches_per_month: number } | null;
              const status = o.subscription_status ?? 'inactive';

              const statusBadgeClass =
                status === 'active'
                  ? styles.badgeActive
                  : status === 'cancelled'
                  ? styles.badgeCancelled
                  : styles.badgeInactive;

              return (
                <tr key={o.id}>
                  <td style={{ fontWeight: 600 }}>{ownerUser?.name ?? '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                    {ownerUser?.email ?? '—'}
                  </td>
                  <td>
                    {plan ? (
                      <span>
                        <span style={{ fontWeight: 600 }}>{plan.name}</span>
                        <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', marginLeft: 6 }}>
                          ${plan.price}/mes · {plan.max_matches_per_month} partidos
                        </span>
                      </span>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)' }}>Sin plan</span>
                    )}
                  </td>
                  <td>
                    <span className={`${styles.badge} ${statusBadgeClass}`}>{status}</span>
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    <span
                      style={{
                        fontWeight: 700,
                        color: (o.cancellation_count ?? 0) >= 3 ? 'var(--color-error)' : 'var(--color-text)',
                      }}
                    >
                      {o.cancellation_count ?? 0}
                    </span>
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
