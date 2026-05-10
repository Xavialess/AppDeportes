import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Reembolsos — Admin cancha.',
};

async function issueRefund(formData: FormData) {
  'use server';
  const payment_id = String(formData.get('payment_id'));
  const enrollment_id = String(formData.get('enrollment_id'));
  const admin = createAdminClient();

  await Promise.all([
    admin.from('payments').update({ status: 'refunded' }).eq('id', payment_id),
    admin.from('enrollments').update({ status: 'refunded' }).eq('id', enrollment_id),
  ]);

  redirect('/admin/refunds');
}

export default async function RefundsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const { data: payments } = await admin
    .from('payments')
    .select(`
      id,
      amount,
      status,
      provider,
      created_at,
      enrollment_id,
      enrollments(id, match_id, user_id, status, users(name, email))
    `)
    .in('status', ['completed', 'refunded'])
    .order('created_at', { ascending: false })
    .limit(200);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Supervisión</span>
          <h1 className={styles.pageTitle}>Reembolsos</h1>
        </div>
      </header>

      <p style={{ marginBottom: 'var(--space-5)', color: 'var(--color-text-muted)', fontSize: 'var(--text-sm)' }}>
        Lista de pagos completados. Un reembolso manual actualiza el estado del pago y la inscripción a <strong>refunded</strong>. El proceso de devolución de dinero real debe realizarse desde el panel del proveedor de pagos.
      </p>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Jugador</th>
              <th>Email</th>
              <th>Monto</th>
              <th>Proveedor</th>
              <th>Estado pago</th>
              <th>Estado inscripción</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {(payments ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className={styles.tableEmpty}>Sin pagos completados.</td>
              </tr>
            )}
            {(payments ?? []).map((p) => {
              const enrollment = p.enrollments as {
                id: string;
                match_id: string;
                user_id: string;
                status: string;
                users: { name: string | null; email: string } | null;
              } | null;
              const playerName = enrollment?.users?.name ?? '—';
              const playerEmail = enrollment?.users?.email ?? '—';
              const enrollStatus = enrollment?.status ?? '—';
              const isRefunded = p.status === 'refunded';
              const date = p.created_at
                ? new Date(p.created_at).toLocaleDateString('es-EC', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—';

              return (
                <tr key={p.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{date}</td>
                  <td style={{ fontWeight: 600 }}>{playerName}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{playerEmail}</td>
                  <td style={{ fontWeight: 700 }}>${(p.amount ?? 0).toFixed(2)}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)', textTransform: 'capitalize' }}>
                    {p.provider ?? '—'}
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        isRefunded ? styles.badgeRefunded : styles.badgeActive
                      }`}
                    >
                      {isRefunded ? 'Reembolsado' : 'Completado'}
                    </span>
                  </td>
                  <td>
                    <span
                      className={`${styles.badge} ${
                        enrollStatus === 'refunded' ? styles.badgeRefunded : styles.badgeInactive
                      }`}
                    >
                      {enrollStatus}
                    </span>
                  </td>
                  <td>
                    {!isRefunded && enrollment ? (
                      <form action={issueRefund}>
                        <input type="hidden" name="payment_id" value={p.id} />
                        <input type="hidden" name="enrollment_id" value={enrollment.id} />
                        <button type="submit" className={styles.btnDanger}>
                          Reembolsar
                        </button>
                      </form>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>—</span>
                    )}
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
