import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import '@/styles/shell.css';
import styles from './admin.module.css';

interface AdminLayoutProps {
  children: ReactNode;
}

const NAV_GROUPS = [
  {
    label: 'Datos de referencia',
    items: [
      { href: '/admin/countries', icon: '🌎', label: 'Países' },
      { href: '/admin/cities', icon: '🏙️', label: 'Ciudades' },
      { href: '/admin/sports', icon: '⚽', label: 'Deportes' },
      { href: '/admin/city-sports', icon: '🔗', label: 'Ciudad–Deporte' },
      { href: '/admin/plans', icon: '📦', label: 'Planes' },
    ],
  },
  {
    label: 'Supervisión',
    items: [
      { href: '/admin/users', icon: '👥', label: 'Usuarios' },
      { href: '/admin/owners', icon: '🏟️', label: 'Propietarios' },
      { href: '/admin/matches', icon: '📋', label: 'Partidos' },
      { href: '/admin/refunds', icon: '💸', label: 'Reembolsos' },
    ],
  },
  {
    label: 'Ventas',
    items: [
      { href: '/crm', icon: '🎯', label: 'CRM Pipeline' },
    ],
  },
];

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="Admin navigation">
        <div className="sidebarTop">
          <div className="brandRow">
            <span className="brandName">
              cancha<span className={styles.brandDot}>.</span>
            </span>
          </div>
          <div className={styles.adminBadge}>Admin</div>
        </div>

        <nav className="nav" aria-label="Admin sections">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className={styles.navGroup}>
              <p className={styles.navGroupLabel}>{group.label}</p>
              {group.items.map((item) => (
                <Link key={item.href} href={item.href} className="navItem">
                  <span className="navIcon" aria-hidden="true">
                    {item.icon}
                  </span>
                  {item.label}
                </Link>
              ))}
            </div>
          ))}

          <div className={styles.navDivider} />

          <Link href="/dashboard" className="navItem">
            <span className="navIcon" aria-hidden="true">←</span>
            Dashboard
          </Link>
        </nav>

        <div className="sidebarBottom">
          <Link href="/dashboard" className={styles.backLink}>
            ← Salir del panel de admin
          </Link>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
