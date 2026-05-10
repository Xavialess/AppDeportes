import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../admin.module.css';

export const metadata: Metadata = {
  title: 'Usuarios — Admin cancha.',
};

async function toggleSuspend(formData: FormData) {
  'use server';
  const id = String(formData.get('id'));
  const is_suspended = formData.get('is_suspended') === 'true';
  const admin = createAdminClient();
  // Attempt update; fails silently if column doesn't exist
  await admin.from('users').update({ is_suspended: !is_suspended } as Record<string, unknown>).eq('id', id);
  redirect('/admin/users');
}

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const { data: users } = await admin
    .from('users')
    .select('id, name, email, role, matches_played, is_pro, is_suspended')
    .order('name');

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Supervisión</span>
          <h1 className={styles.pageTitle}>Usuarios</h1>
        </div>
      </header>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Email</th>
              <th>Rol</th>
              <th>Partidos</th>
              <th>Pro</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            {(users ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className={styles.tableEmpty}>Sin usuarios registrados.</td>
              </tr>
            )}
            {(users ?? []).map((u) => {
              const isSuspended = u.is_suspended ?? false;
              return (
                <tr key={u.id}>
                  <td style={{ fontWeight: 600 }}>{u.name ?? '—'}</td>
                  <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{u.email}</td>
                  <td>
                    <span
                      className={styles.badge}
                      style={{
                        background:
                          u.role === 'admin'
                            ? 'rgba(212,255,58,0.12)'
                            : u.role === 'owner'
                            ? 'oklch(65% 0.18 250 / 0.12)'
                            : 'var(--color-surface-2)',
                        color:
                          u.role === 'admin'
                            ? 'var(--color-accent)'
                            : u.role === 'owner'
                            ? 'oklch(70% 0.18 250)'
                            : 'var(--color-text-muted)',
                      }}
                    >
                      {u.role ?? 'player'}
                    </span>
                  </td>
                  <td style={{ textAlign: 'center' }}>{u.matches_played ?? 0}</td>
                  <td style={{ textAlign: 'center' }}>
                    {u.is_pro ? (
                      <span className={`${styles.badge} ${styles.badgeActive}`}>Pro</span>
                    ) : (
                      <span style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <form action={toggleSuspend}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="is_suspended" value={String(isSuspended)} />
                      <button
                        type="submit"
                        className={isSuspended ? styles.btnToggleOff : styles.btnDanger}
                        disabled={u.role === 'admin'}
                        title={u.role === 'admin' ? 'No se puede suspender a un admin' : undefined}
                      >
                        {isSuspended ? 'Reactivar' : 'Suspender'}
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
