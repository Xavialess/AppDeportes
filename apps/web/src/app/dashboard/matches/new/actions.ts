'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export interface CreateMatchResult {
  error?: string;
}

export async function createMatch(formData: FormData): Promise<CreateMatchResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'No autenticado' };

  const type = formData.get('type') as 'open' | 'reservation';
  const fieldId = formData.get('field_id') as string;
  const sportId = formData.get('sport_id') as string;
  const format = formData.get('format') as string;
  const date = formData.get('date') as string;
  const startTime = formData.get('start_time') as string;
  const endTime = formData.get('end_time') as string;
  const isVisible = formData.get('is_visible') === 'true';

  if (!type || !fieldId || !sportId || !format || !date || !startTime || !endTime) {
    return { error: 'Todos los campos base son requeridos.' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (new Date(date) < today) {
    return { error: 'La fecha del partido debe ser hoy o en el futuro.' };
  }

  // Verify field ownership via clubs join
  const { data: field } = await supabase
    .from('fields').select('id, clubs(owner_id)').eq('id', fieldId).single();
  const fieldClub = field?.clubs as { owner_id: string } | null;
  if (!field || fieldClub?.owner_id !== user.id) {
    return { error: 'No tienes acceso a esta cancha.' };
  }

  // Check plan limit
  const admin = createAdminClient();
  const { data: ownerProfile } = await admin
    .from('owner_profiles')
    .select('plan_id, plans(max_matches_per_month)')
    .eq('user_id', user.id)
    .single();

  const maxMatches = (ownerProfile?.plans as { max_matches_per_month: number } | null)?.max_matches_per_month ?? 0;

  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-01`;
  const { count: usedCount } = await admin
    .from('matches')
    .select('id', { count: 'exact', head: true })
    .eq('field_id', fieldId)
    .gte('date', monthStart)
    .neq('status', 'cancelled');

  if (maxMatches > 0 && (usedCount ?? 0) >= maxMatches) {
    return { error: `Has alcanzado el límite de ${maxMatches} partidos este mes en tu plan.` };
  }

  type InsertPayload = {
    type: 'open' | 'reservation';
    field_id: string;
    sport_id: string;
    format: string;
    date: string;
    start_time: string;
    end_time: string;
    is_visible: boolean;
    price_per_player?: number;
    min_players?: number;
    max_players?: number;
    confirmation_deadline?: string;
    total_price?: number;
  };

  const payload: InsertPayload = {
    type, field_id: fieldId, sport_id: sportId, format,
    date, start_time: startTime, end_time: endTime, is_visible: isVisible,
  };

  if (type === 'open') {
    const pricePerPlayer = parseFloat(formData.get('price_per_player') as string);
    const minPlayers = parseInt(formData.get('min_players') as string, 10);
    const maxPlayers = parseInt(formData.get('max_players') as string, 10);
    const deadline = formData.get('confirmation_deadline') as string;

    if (!pricePerPlayer || pricePerPlayer <= 0) return { error: 'El precio por jugador debe ser mayor a 0.' };
    if (!minPlayers || minPlayers < 2) return { error: 'El mínimo de jugadores debe ser al menos 2.' };
    if (!maxPlayers || maxPlayers < minPlayers) return { error: 'El máximo de jugadores debe ser mayor o igual al mínimo.' };
    if (!deadline) return { error: 'El plazo de confirmación es requerido.' };
    if (new Date(deadline) >= new Date(date)) return { error: 'El plazo de confirmación debe ser antes de la fecha del partido.' };

    payload.price_per_player = pricePerPlayer;
    payload.min_players = minPlayers;
    payload.max_players = maxPlayers;
    payload.confirmation_deadline = new Date(deadline).toISOString();
  } else {
    const totalPrice = parseFloat(formData.get('total_price') as string);
    if (!totalPrice || totalPrice <= 0) return { error: 'El precio total debe ser mayor a 0.' };
    payload.total_price = totalPrice;
  }

  const { error: insertErr } = await admin.from('matches').insert(payload);
  if (insertErr) return { error: `No se pudo crear el partido: ${insertErr.message}` };

  redirect('/dashboard/matches');
}
