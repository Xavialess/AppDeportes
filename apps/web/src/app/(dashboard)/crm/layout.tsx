import React from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import '@/styles/shell.css';
import styles from '@/app/admin/admin.module.css';

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileData } = await supabase
    .from('users')
    .select('role, name')
    .eq('id', user.id)
    .single();
  const profile = profileData as { role: string; name: string | null } | null;

  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  return (
    <div className="shell">
      <aside className="sidebar" aria-label="CRM navigation">
        <div className="sidebarTop">
          <div className="brandRow">
            <span className="brandName">
              cancha<span className={styles.brandDot}>.</span>
            </span>
          </div>
          <div className={styles.adminBadge}>CRM</div>
        </div>

        <nav className="nav" aria-label="CRM sections">
          <Link href="/crm" className="navItem">
            <span className="navIcon" aria-hidden="true">📋</span>
            Pipeline
          </Link>
          <Link href="/crm/new" className="navItem">
            <span className="navIcon" aria-hidden="true">➕</span>
            Nuevo lead
          </Link>

          <div className={styles.navDivider} />

          <Link href="/admin" className="navItem">
            <span className="navIcon" aria-hidden="true">←</span>
            Admin
          </Link>
        </nav>

        <div className="sidebarBottom">
          <Link href="/admin" className={styles.backLink}>
            ← Salir del CRM
          </Link>
        </div>
      </aside>

      <main className="main">{children}</main>
    </div>
  );
}
