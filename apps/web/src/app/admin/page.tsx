import type { Metadata } from 'next';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from './admin.module.css';

export const metadata: Metadata = {
  title: 'Admin — cancha.',
};

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();

  const [
    { count: usersCount },
    { count: ownersCount },
    { count: matchesCount },
    { count: countriesCount },
    { count: citiesCount },
    { count: sportsCount },
  ] = await Promise.all([
    admin.from('users').select('*', { count: 'exact', head: true }),
    admin.from('owner_profiles').select('*', { count: 'exact', head: true }),
    admin.from('matches').select('*', { count: 'exact', head: true }),
    admin.from('countries').select('*', { count: 'exact', head: true }),
    admin.from('cities').select('*', { count: 'exact', head: true }),
    admin.from('sports').select('*', { count: 'exact', head: true }),
  ]);

  const STATS = [
    { label: 'Usuarios', value: usersCount ?? 0, accent: 'var(--color-accent)', href: '/admin/users' },
    { label: 'Propietarios', value: ownersCount ?? 0, accent: 'oklch(65% 0.18 250)', href: '/admin/owners' },
    { label: 'Partidos', value: matchesCount ?? 0, accent: 'oklch(68% 0.18 155)', href: '/admin/matches' },
    { label: 'Países', value: countriesCount ?? 0, accent: 'oklch(65% 0.18 300)', href: '/admin/countries' },
    { label: 'Ciudades', value: citiesCount ?? 0, accent: 'oklch(60% 0.22 25)', href: '/admin/cities' },
    { label: 'Deportes', value: sportsCount ?? 0, accent: 'oklch(65% 0.20 55)', href: '/admin/sports' },
  ];

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Panel de control</span>
          <h1 className={styles.pageTitle}>Administración</h1>
        </div>
      </header>

      <div className={styles.statsGrid}>
        {STATS.map((stat) => (
          <Link
            key={stat.label}
            href={stat.href}
            className={styles.statCard}
            style={{ '--card-accent': stat.accent } as CSSProperties}
          >
            <p className={styles.statLabel}>{stat.label}</p>
            <p className={styles.statValue}>{stat.value}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
