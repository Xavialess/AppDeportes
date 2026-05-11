import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { LogoutButton } from '@/app/(dashboard)/LogoutButton';
import { NavLink } from '@/app/dashboard/NavLink';
import { MobileNav } from '@/app/dashboard/MobileNav';
import '@/styles/shell.css';
import styles from '@/app/(dashboard)/dashboard.module.css';

interface DashboardLayoutProps {
  children: ReactNode;
}

const NAV_ITEMS = [
  { icon: '🏠', label: 'Inicio', href: '/dashboard', exact: true },
  { icon: '⚽', label: 'Mis partidos', href: '/dashboard/matches', exact: false },
  { icon: '🏟️', label: 'Mis canchas', href: '/dashboard/fields', exact: false },
  { icon: '💳', label: 'Suscripción', href: '/dashboard/plan', exact: false },
];

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

  // Auto-create owner_profiles row if missing (handles accounts registered before this fix)
  if (role === 'owner') {
    await supabase
      .from('owner_profiles')
      .upsert({ user_id: user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
  }

  const displayName = profile?.name ?? user.email ?? 'Propietario';
  const initials = displayName
    .split(' ')
    .slice(0, 2)
    .map((part: string) => part[0] ?? '')
    .join('')
    .toUpperCase();

  const roleLabel = role === 'admin' ? 'Administrador' : 'Propietario';

  const mobileNavItems = [
    ...NAV_ITEMS,
    ...(role === 'admin' ? [{ icon: '🛡️', label: 'Admin', href: '/admin', exact: false }] : []),
  ];

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Navegación principal">
        <div className="sidebarTop">
          <div className="brandRow">
            <span className="brandName">
              cancha<span className={styles.brandDot}>.</span>
            </span>
          </div>
          <MobileNav
            items={mobileNavItems}
            userInitials={initials}
            userName={displayName}
            roleLabel={roleLabel}
          />
        </div>

        <ul className="nav" role="list">
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

        <div className="sidebarBottom">
          <div className={styles.userInfo}>
            <div className="avatar" aria-hidden="true">{initials}</div>
            <div className={styles.userMeta}>
              <div className={styles.userName}>{displayName}</div>
              <div className={styles.userRole}>{roleLabel}</div>
            </div>
          </div>
          <LogoutButton />
        </div>
      </nav>

      <main className="main">
        {children}
      </main>
    </div>
  );
}
