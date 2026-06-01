'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function cancelMatchAction(matchId: string): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'owner' && profile?.role !== 'admin') {
    return { error: 'No autorizado' };
  }

  // Verify ownership (admins bypass)
  if (profile.role !== 'admin') {
    const { data: match } = await supabase
      .from('matches')
      .select('field_id, fields(owner_id)')
      .eq('id', matchId)
      .single();
    const field = match?.fields as { owner_id: string } | null;
    if (field?.owner_id !== user.id) return { error: 'No autorizado' };
  }

  const admin = createAdminClient();
  const { error: matchErr } = await admin
    .from('matches')
    .update({
      status: 'cancelled',
      cancellation_reason: 'Cancelado por el propietario',
      cancelled_by: user.id,
    })
    .eq('id', matchId)
    .in('status', ['open', 'confirmed']);

  if (matchErr) return { error: 'No se pudo cancelar el partido' };

  await admin
    .from('enrollments')
    .update({ status: 'cancelled' })
    .eq('match_id', matchId)
    .in('status', ['pending', 'confirmed']);

  revalidatePath(`/dashboard/matches/${matchId}`);
  revalidatePath('/dashboard/matches');
  return {};
}
