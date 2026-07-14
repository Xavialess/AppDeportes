'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export interface UpdateMatchResult {
  error?: string;
}

export async function updateMatch(matchId: string, formData: FormData): Promise<UpdateMatchResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  // Verify ownership and get match type/status
  const { data: match } = await supabase
    .from('matches')
    .select('id, type, status, field_id, fields(clubs(owner_id))')
    .eq('id', matchId)
    .single();

  if (!match) return { error: 'Partido no encontrado.' };

  const club = (match.fields as { clubs: { owner_id: string } | null } | null)?.clubs;
  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin' && club?.owner_id !== user.id) {
    return { error: 'No tienes acceso a este partido.' };
  }

  if (match.status !== 'open' && match.status !== 'confirmed') {
    return { error: 'Solo puedes editar partidos en estado Abierto o Confirmado.' };
  }

  // Count active enrollments to determine edit scope
  const { count: enrolledCount } = await supabase
    .from('enrollments')
    .select('id', { count: 'exact', head: true })
    .eq('match_id', matchId)
    .in('status', ['pending', 'confirmed', 'payment_pending']);

  const canEditAll = match.status === 'open' && (enrolledCount ?? 0) === 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updates: Record<string, any> = {};

  if (canEditAll) {
    const fieldId = formData.get('field_id') as string;
    const sportId = formData.get('sport_id') as string;
    const format = formData.get('format') as string;
    const date = formData.get('date') as string;
    const startTime = formData.get('start_time') as string;
    const endTime = formData.get('end_time') as string;

    if (!fieldId || !sportId || !date || !startTime || !endTime) {
      return { error: 'Todos los campos base son requeridos.' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [year, month, day] = date.split('-').map(Number);
    if (new Date(year, month - 1, day) < today) {
      return { error: 'La fecha del partido debe ser hoy o en el futuro.' };
    }

    // Verify the chosen field still belongs to this owner
    const { data: fieldCheck } = await supabase
      .from('fields').select('id, clubs(owner_id)').eq('id', fieldId).single();
    const fieldClub = (fieldCheck?.clubs as { owner_id: string } | null);
    if (!fieldCheck || (profile?.role !== 'admin' && fieldClub?.owner_id !== user.id)) {
      return { error: 'No tienes acceso a esa cancha.' };
    }

    updates.field_id = fieldId;
    updates.sport_id = sportId;
    updates.format = format || null;
    updates.date = date;
    updates.start_time = startTime;
    updates.end_time = endTime;
  }

  if (match.type === 'open') {
    const pricePerPlayer = parseFloat(formData.get('price_per_player') as string);
    const minPlayers = parseInt(formData.get('min_players') as string, 10);
    const maxPlayers = parseInt(formData.get('max_players') as string, 10);
    const deadline = formData.get('confirmation_deadline') as string;

    if (!pricePerPlayer || pricePerPlayer <= 0) return { error: 'El precio por jugador debe ser mayor a 0.' };
    if (!minPlayers || minPlayers < 2) return { error: 'El mínimo de jugadores debe ser al menos 2.' };
    if (!maxPlayers || maxPlayers < minPlayers) return { error: 'El máximo no puede ser menor al mínimo.' };
    if (maxPlayers < (enrolledCount ?? 0)) {
      return { error: `El máximo no puede ser menor que los ${enrolledCount} jugadores ya inscritos.` };
    }
    if (!deadline) return { error: 'El plazo de confirmación es requerido.' };

    if (canEditAll) {
      const startTime = formData.get('start_time') as string;
      const date = formData.get('date') as string;
      const kickoff = new Date(`${date}T${startTime}`);
      if (new Date(deadline) >= kickoff) {
        return { error: 'El plazo de confirmación debe ser antes de la hora de inicio del partido.' };
      }
    }

    updates.price_per_player = pricePerPlayer;
    updates.min_players = minPlayers;
    updates.max_players = maxPlayers;
    updates.confirmation_deadline = new Date(deadline).toISOString();
  } else {
    const totalPrice = parseFloat(formData.get('total_price') as string);
    if (!totalPrice || totalPrice <= 0) return { error: 'El precio total debe ser mayor a 0.' };
    updates.total_price = totalPrice;
  }

  const { error: updateErr } = await supabase.from('matches').update(updates).eq('id', matchId);
  if (updateErr) return { error: `No se pudo guardar: ${updateErr.message}` };

  redirect(`/dashboard/matches/${matchId}`);
}
