import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from '../fields.module.css';
import fieldStyles from './field-detail.module.css';

export const metadata: Metadata = { title: 'Gestionar cancha — cancha.' };

async function uploadImages(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const fieldId = formData.get('field_id') as string;
  if (!fieldId) return;

  // Verify ownership via clubs join
  const { data: field } = await supabase
    .from('fields')
    .select('id, images, clubs(owner_id)')
    .eq('id', fieldId)
    .single();

  const clubOwner = field?.clubs as { owner_id: string } | null;
  if (!field || clubOwner?.owner_id !== user.id) return;

  const files = formData.getAll('images') as File[];
  const validFiles = files.filter((f) => f.size > 0);
  if (validFiles.length === 0) {
    redirect(`/dashboard/fields/${fieldId}`);
  }

  const admin = createAdminClient();
  const newUrls: string[] = [];

  for (const file of validFiles) {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const storagePath = `${fieldId}/${safeName}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadErr } = await admin.storage
      .from('field-images')
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: false });

    if (!uploadErr) {
      const { data: { publicUrl } } = admin.storage
        .from('field-images')
        .getPublicUrl(storagePath);
      newUrls.push(publicUrl);
    }
  }

  if (newUrls.length > 0) {
    const updatedImages = [...(field.images ?? []), ...newUrls];
    await admin.from('fields').update({ images: updatedImages }).eq('id', fieldId);
  }

  revalidatePath(`/dashboard/fields/${fieldId}`);
  redirect(`/dashboard/fields/${fieldId}`);
}

async function removeImage(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const fieldId = formData.get('field_id') as string;
  const imageUrl = formData.get('image_url') as string;
  if (!fieldId || !imageUrl) return;

  // Verify ownership via clubs join
  const { data: field } = await supabase
    .from('fields')
    .select('id, images, clubs(owner_id)')
    .eq('id', fieldId)
    .single();

  const clubOwner = field?.clubs as { owner_id: string } | null;
  if (!field || clubOwner?.owner_id !== user.id) return;

  const admin = createAdminClient();

  const url = new URL(imageUrl);
  const pathSegments = url.pathname.split('/object/public/field-images/');
  if (pathSegments[1]) {
    await admin.storage.from('field-images').remove([decodeURIComponent(pathSegments[1])]);
  }

  const updatedImages = (field.images ?? []).filter((img) => img !== imageUrl);
  await admin.from('fields').update({ images: updatedImages }).eq('id', fieldId);

  revalidatePath(`/dashboard/fields/${fieldId}`);
  redirect(`/dashboard/fields/${fieldId}`);
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}

export default async function FieldDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { error } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: field } = await supabase
    .from('fields')
    .select('id, name, images, clubs(id, name, address, owner_id), cities(name)')
    .eq('id', id)
    .single();

  // Verify the authenticated user owns this field (via club)
  const club = field?.clubs as { id: string; name: string; address: string; owner_id: string } | null;
  if (!field || club?.owner_id !== user.id) redirect('/dashboard/fields');

  const city = field.cities as { name: string } | null;
  const images = (field.images ?? []) as string[];

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Gestión</span>
          <h1 className={styles.pageTitle}>{field.name}</h1>
          <p className={fieldStyles.fieldMeta}>
            {club?.name ?? ''}
            {city ? ` · ${city.name}` : ''}
          </p>
        </div>
        <Link href={club?.id ? `/dashboard/clubs/${club.id}` : '/dashboard/fields'} className={styles.cancelBtn}>
          ← {club?.name ?? 'Mis Canchas'}
        </Link>
      </header>

      {error && (
        <div className={styles.errorBanner} role="alert">{error}</div>
      )}

      {/* Image gallery */}
      <section className={fieldStyles.section}>
        <h2 className={fieldStyles.sectionTitle}>Fotos de la cancha</h2>

        {images.length > 0 ? (
          <div className={fieldStyles.imageGrid}>
            {images.map((url) => (
              <div key={url} className={fieldStyles.imageCard}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Foto de la cancha" className={fieldStyles.image} />
                <form action={removeImage} className={fieldStyles.removeForm}>
                  <input type="hidden" name="field_id" value={field.id} />
                  <input type="hidden" name="image_url" value={url} />
                  <button type="submit" className={fieldStyles.removeBtn} title="Eliminar foto">
                    ✕
                  </button>
                </form>
              </div>
            ))}
          </div>
        ) : (
          <p className={fieldStyles.noImages}>Sin fotos aún. Sube algunas para que los jugadores conozcan tu cancha.</p>
        )}

        {images.length < 10 && (
          <form action={uploadImages} className={fieldStyles.uploadForm}>
            <input type="hidden" name="field_id" value={field.id} />
            <label className={fieldStyles.uploadLabel} htmlFor="images">
              <span className={fieldStyles.uploadIcon}>+</span>
              <span className={fieldStyles.uploadText}>Agregar fotos</span>
              <span className={fieldStyles.uploadHint}>JPG, PNG o WEBP · Máx. 5 MB por imagen</span>
              <input
                id="images"
                type="file"
                name="images"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className={fieldStyles.fileInput}
              />
            </label>
            <button type="submit" className={styles.submitBtn}>
              Subir fotos
            </button>
          </form>
        )}
      </section>
    </>
  );
}
