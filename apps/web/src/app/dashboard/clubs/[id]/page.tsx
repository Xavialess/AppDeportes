import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import styles from '../../fields/fields.module.css';
import detailStyles from './club-detail.module.css';

export const metadata: Metadata = { title: 'Detalle complejo — cancha.' };

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClubDetailPage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: club } = await supabase
    .from('clubs')
    .select('id, name, address, description, is_active, cities(name)')
    .eq('id', id)
    .eq('owner_id', user.id)
    .single();

  if (!club) redirect('/dashboard/clubs');

  const city = club.cities as { name: string } | null;

  const { data: fields } = await supabase
    .from('fields')
    .select('id, name, images')
    .eq('club_id', id)
    .order('name');

  // Count active matches per field
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
          <span className={styles.pageTag}>Complejo</span>
          <h1 className={styles.pageTitle}>{club.name}</h1>
          <p className={detailStyles.meta}>
            {club.address}{city ? ` · ${city.name}` : ''}
            {!club.is_active ? ' · Inactivo' : ''}
          </p>
          {club.description ? (
            <p className={detailStyles.description}>{club.description}</p>
          ) : null}
        </div>
        <Link href="/dashboard/clubs" className={styles.cancelBtn}>
          ← Mis Complejos
        </Link>
      </header>

      <section className={detailStyles.section}>
        <div className={detailStyles.sectionHeader}>
          <h2 className={detailStyles.sectionTitle}>
            Canchas · {(fields ?? []).length}
          </h2>
          <Link href={`/dashboard/fields/new?club_id=${club.id}`} className={styles.addBtn}>
            + Agregar cancha
          </Link>
        </div>

        {fields && fields.length > 0 ? (
          <ul className={styles.list} role="list">
            {fields.map((field) => {
              const activeMatches = countByField[field.id] ?? 0;
              const imageCount = (field.images ?? []).length;
              return (
                <li key={field.id}>
                  <Link
                    href={`/dashboard/fields/${field.id}`}
                    className={styles.card}
                    style={{ display: 'block', textDecoration: 'none' }}
                  >
                    <div className={styles.cardName}>{field.name}</div>
                    <div className={styles.cardStats}>
                      <span className={styles.statChip}>
                        {activeMatches} partido{activeMatches !== 1 ? 's' : ''} activo{activeMatches !== 1 ? 's' : ''}
                      </span>
                      <span className={styles.statChip}>
                        {imageCount} foto{imageCount !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className={detailStyles.emptyFields}>
            <p className={detailStyles.emptyFieldsTitle}>Sin canchas en este complejo</p>
            <p className={detailStyles.emptyFieldsText}>
              Agrega la primera cancha para empezar a publicar partidos.
            </p>
          </div>
        )}
      </section>
    </>
  );
}
