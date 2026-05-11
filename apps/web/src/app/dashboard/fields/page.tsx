import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import styles from './fields.module.css';

export const metadata: Metadata = { title: 'Mis Canchas — cancha.' };

export default async function FieldsPage() {
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

  const { data: fields } = await supabase
    .from('fields')
    .select('id, name, address, cities(name)')
    .eq('owner_id', user.id)
    .order('name');

  // Fetch active match counts per field
  const fieldIds = (fields ?? []).map(f => f.id);
  const { data: matchCounts } = fieldIds.length > 0
    ? await supabase
        .from('matches')
        .select('field_id')
        .in('field_id', fieldIds)
        .in('status', ['open', 'confirmed'])
    : { data: [] };

  const countByField: Record<string, number> = {};
  (matchCounts ?? []).forEach(m => {
    countByField[m.field_id] = (countByField[m.field_id] ?? 0) + 1;
  });

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Gestión</span>
          <h1 className={styles.pageTitle}>Mis Canchas</h1>
        </div>
        <Link href="/dashboard/fields/new" className={styles.addBtn}>
          + Registrar cancha
        </Link>
      </header>

      {fields && fields.length > 0 ? (
        <ul className={styles.list} role="list">
          {fields.map((field) => {
            const city = field.cities as { name: string } | null;
            return (
              <li key={field.id}>
                <Link href={`/dashboard/fields/${field.id}`} className={styles.card} style={{ display: 'block', textDecoration: 'none' }}>
                  <div className={styles.cardName}>{field.name}</div>
                  <div className={styles.cardMeta}>
                    {field.address}
                    {city ? ` · ${city.name}` : ''}
                  </div>
                  <div className={styles.cardStats}>
                    <span className={styles.statChip}>
                      {countByField[field.id] ?? 0} partido{(countByField[field.id] ?? 0) !== 1 ? 's' : ''} activo{(countByField[field.id] ?? 0) !== 1 ? 's' : ''}
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
          <p className={styles.emptyTitle}>Sin canchas registradas</p>
          <p className={styles.emptyText}>
            Registra tu primera cancha para empezar a publicar partidos.
          </p>
          <Link href="/dashboard/fields/new" className={styles.addBtn}>
            + Registrar cancha
          </Link>
        </div>
      )}
    </>
  );
}
