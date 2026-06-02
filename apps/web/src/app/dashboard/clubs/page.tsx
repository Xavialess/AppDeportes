import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import styles from '../fields/fields.module.css';

export const metadata: Metadata = { title: 'Mis Complejos — cancha.' };

export default async function ClubsPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    redirect('/login?error=unauthorized');
  }

  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name, address, is_active, cities(name)')
    .eq('owner_id', user.id)
    .order('name');

  // Count fields per club
  const clubIds = (clubs ?? []).map(c => c.id);
  const { data: fieldRows } = clubIds.length > 0
    ? await supabase
        .from('fields')
        .select('club_id')
        .in('club_id', clubIds)
    : { data: [] };

  const fieldCountByClub: Record<string, number> = {};
  (fieldRows ?? []).forEach(f => {
    fieldCountByClub[f.club_id] = (fieldCountByClub[f.club_id] ?? 0) + 1;
  });

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Gestión</span>
          <h1 className={styles.pageTitle}>Mis Complejos</h1>
        </div>
        <Link href="/dashboard/clubs/new" className={styles.addBtn}>
          + Registrar complejo
        </Link>
      </header>

      {clubs && clubs.length > 0 ? (
        <ul className={styles.list} role="list">
          {clubs.map((club) => {
            const city = club.cities as { name: string } | null;
            const fieldCount = fieldCountByClub[club.id] ?? 0;
            return (
              <li key={club.id}>
                <Link
                  href={`/dashboard/clubs/${club.id}`}
                  className={styles.card}
                  style={{ display: 'block', textDecoration: 'none' }}
                >
                  <div className={styles.cardName}>{club.name}</div>
                  <div className={styles.cardMeta}>
                    {club.address}
                    {city ? ` · ${city.name}` : ''}
                    {!club.is_active ? ' · Inactivo' : ''}
                  </div>
                  <div className={styles.cardStats}>
                    <span className={styles.statChip}>
                      {fieldCount} cancha{fieldCount !== 1 ? 's' : ''}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>🏟️</div>
          <p className={styles.emptyTitle}>Sin complejos registrados</p>
          <p className={styles.emptyText}>
            Registra tu primer complejo deportivo para organizar tus canchas.
          </p>
          <Link href="/dashboard/clubs/new" className={styles.addBtn}>
            + Registrar complejo
          </Link>
        </div>
      )}
    </>
  );
}
