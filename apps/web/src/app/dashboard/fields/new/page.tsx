import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import styles from '../fields.module.css';

export const metadata: Metadata = { title: 'Agregar cancha — cancha.' };

async function createField(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Re-verify role and ownership of club server-side
  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    redirect('/login?error=unauthorized');
  }

  const clubId = formData.get('club_id') as string;
  const name = (formData.get('name') as string).trim();

  // Verify the user owns this club
  const { data: club } = await supabase
    .from('clubs').select('id').eq('id', clubId).eq('owner_id', user.id).single();
  if (!club) {
    redirect(`/dashboard/fields/new?error=${encodeURIComponent('No tienes acceso a este complejo.')}`);
  }

  // Fetch city_id from the club for denormalization
  const { data: clubFull } = await supabase
    .from('clubs').select('city_id').eq('id', clubId).single();
  if (!clubFull) {
    redirect(`/dashboard/fields/new?error=${encodeURIComponent('Complejo no encontrado.')}`);
  }

  const { error } = await supabase.from('fields').insert({
    club_id: clubId,
    city_id: clubFull.city_id,
    name,
    images: [],
  });

  if (error) {
    redirect(`/dashboard/fields/new?club_id=${clubId}&error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath('/dashboard/fields');
  revalidatePath(`/dashboard/clubs/${clubId}`);
  redirect(`/dashboard/clubs/${clubId}`);
}

interface PageProps {
  searchParams: Promise<{ error?: string; club_id?: string }>;
}

export default async function NewFieldPage({ searchParams }: PageProps) {
  const { error, club_id: preselectedClubId } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    redirect('/login?error=unauthorized');
  }

  const { data: clubs } = await supabase
    .from('clubs')
    .select('id, name, cities(name)')
    .eq('owner_id', user.id)
    .eq('is_active', true)
    .order('name');

  if (!clubs || clubs.length === 0) {
    redirect('/dashboard/clubs/new');
  }

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Gestión</span>
          <h1 className={styles.pageTitle}>Agregar cancha</h1>
        </div>
      </header>

      <div className={styles.formCard}>
        <form action={createField}>
          <div className={styles.formGrid}>
            {error && (
              <div className={styles.errorBanner} role="alert">{error}</div>
            )}

            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="club_id">Complejo</label>
              <select
                id="club_id"
                name="club_id"
                className={styles.select}
                required
                defaultValue={preselectedClubId ?? clubs[0]?.id ?? ''}
              >
                {clubs.map((club) => {
                  const city = club.cities as { name: string } | null;
                  return (
                    <option key={club.id} value={club.id}>
                      {club.name}{city ? ` (${city.name})` : ''}
                    </option>
                  );
                })}
              </select>
              <p className={styles.hint}>La cancha heredará la ciudad del complejo.</p>
            </div>

            <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
              <label className={styles.label} htmlFor="name">Nombre de la cancha</label>
              <input
                id="name"
                name="name"
                type="text"
                className={styles.input}
                placeholder="Cancha 1 · Fútbol 5"
                required
                autoFocus
              />
            </div>
          </div>

          <div className={styles.formFooter}>
            <Link
              href={preselectedClubId ? `/dashboard/clubs/${preselectedClubId}` : '/dashboard/fields'}
              className={styles.cancelBtn}
            >
              Cancelar
            </Link>
            <button type="submit" className={styles.submitBtn}>
              Agregar cancha
            </button>
          </div>
        </form>
      </div>
    </>
  );
}
