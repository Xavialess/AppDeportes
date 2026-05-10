import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LogoutButton } from '@/app/(dashboard)/LogoutButton';
import { NavLink } from '@/app/dashboard/NavLink';
import styles from '@/app/(dashboard)/dashboard.module.css';

interface DashboardLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { icon: '🏠', label: 'Inicio', href: '/dashboard', exact: true },
  { icon: '⚽', label: 'Mis partidos', href: '/dashboard/matches', exact: false },
  { icon: '🏟️', label: 'Mis canchas', href: '/dashboard/fields', exact: false },
  { icon: '💳', label: 'Suscripción', href: '/dashboard/plan', exact: false },
] as const;

export default async function DashboardLayout({ children }: DashboardLayoutProps) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Fetch role from public.users (not user_metadata — unsafe)
  const { data: profile } = await supabase
    .from('users')
    .select('name, role')
    .eq('id', user.id)
    .single();

  const role = profile?.role;

  if (role !== 'owner' && role !== 'admin') {
    redirect('/login?error=unauthorized');
  }

  const displayName = profile?.name ?? user.email ?? 'Propietario';
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((part: string) => part[0] ?? '')
    .join('')
    .toUpperCase();

  const roleLabel = role === 'admin' ? 'Administrador' : 'Propietario';

  return (
    <div className={styles.shell}>
      <nav className={styles.sidebar} aria-label="Navegación principal">
        <div className={styles.sidebarTop}>
          <div className={styles.brandRow}>
            <span className={styles.brandName}>
              cancha<span className={styles.brandDot}>.</span>
            </span>
          </div>
        </div>

        <ul className={styles.nav} role="list">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink
                href={item.href}
                icon={item.icon}
                label={item.label}
                exact={item.exact}
              />
            </li>
          ))}
          {role === 'admin' && (
            <li>
              <NavLink
                href="/admin"
                icon="🛡️"
                label="Admin"
                exact={false}
              />
            </li>
          )}
        </ul>

        <div className={styles.sidebarBottom}>
          <div className={styles.userInfo}>
            <div className={styles.avatar} aria-hidden="true">{initials}</div>
            <div className={styles.userMeta}>
              <div className={styles.userName}>{displayName}</div>
              <div className={styles.userRole}>{roleLabel}</div>
            </div>
          </div>
          <LogoutButton />
        </div>
      </nav>

      <main className={styles.main}>
        {children}
      </main>
    </div>
  );
}
