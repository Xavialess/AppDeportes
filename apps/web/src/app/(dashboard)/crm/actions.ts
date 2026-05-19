'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const STAGES = ['nuevo', 'contactado', 'demo', 'negociacion', 'ganado', 'perdido'] as const;
type Stage = typeof STAGES[number];

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: profileData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const profile = profileData as { role: string } | null;
  return profile?.role === 'admin';
}

function str(value: FormDataEntryValue | null): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  return value.trim();
}

function requiredStr(value: FormDataEntryValue | null, field: string): string {
  const v = str(value);
  if (!v) throw new Error(`${field} is required`);
  return v;
}

export async function createLead(formData: FormData) {
  if (!await requireAdmin()) redirect('/login?error=unauthorized');

  const owner_name = requiredStr(formData.get('owner_name'), 'owner_name');
  const stage = str(formData.get('stage')) ?? 'nuevo';
  if (!STAGES.includes(stage as Stage)) throw new Error('Invalid stage');

  const admin = createAdminClient();
  const { data, error } = await admin.from('crm_leads').insert({
    owner_name,
    business_name: str(formData.get('business_name')),
    city:          str(formData.get('city')),
    phone:         str(formData.get('phone')),
    email:         str(formData.get('email')),
    stage,
    source:        str(formData.get('source')),
    assigned_to:   str(formData.get('assigned_to')),
  }).select('id').single();

  if (error) throw new Error(error.message);
  redirect(`/crm/${data.id}`);
}

export async function updateLead(formData: FormData) {
  if (!await requireAdmin()) redirect('/login?error=unauthorized');

  const id = requiredStr(formData.get('id'), 'id');

  const admin = createAdminClient();
  await admin.from('crm_leads').update({
    owner_name:    requiredStr(formData.get('owner_name'), 'owner_name'),
    business_name: str(formData.get('business_name')),
    city:          str(formData.get('city')),
    phone:         str(formData.get('phone')),
    email:         str(formData.get('email')),
    source:        str(formData.get('source')),
    assigned_to:   str(formData.get('assigned_to')),
  }).eq('id', id);

  redirect(`/crm/${id}`);
}

export async function deleteLead(formData: FormData) {
  if (!await requireAdmin()) redirect('/login?error=unauthorized');

  const id = requiredStr(formData.get('id'), 'id');
  const admin = createAdminClient();
  await admin.from('crm_leads').delete().eq('id', id);
  redirect('/crm');
}

export async function changeStage(formData: FormData) {
  if (!await requireAdmin()) redirect('/login?error=unauthorized');

  const id    = requiredStr(formData.get('id'), 'id');
  const stage = str(formData.get('stage')) ?? '';

  if (!STAGES.includes(stage as Stage)) throw new Error('Invalid stage');

  const admin = createAdminClient();
  await admin.from('crm_leads').update({ stage }).eq('id', id);
  redirect(`/crm/${id}`);
}

export async function addNote(formData: FormData) {
  if (!await requireAdmin()) redirect('/login?error=unauthorized');

  const lead_id    = requiredStr(formData.get('lead_id'), 'lead_id');
  const body       = requiredStr(formData.get('body'), 'body');
  const created_by = str(formData.get('created_by')) ?? 'Admin';

  const admin = createAdminClient();
  await admin.from('crm_notes').insert({ lead_id, body, created_by });
  redirect(`/crm/${lead_id}`);
}

export async function deleteNote(formData: FormData) {
  if (!await requireAdmin()) redirect('/login?error=unauthorized');

  const note_id = requiredStr(formData.get('note_id'), 'note_id');
  const lead_id = requiredStr(formData.get('lead_id'), 'lead_id');

  const admin = createAdminClient();
  await admin.from('crm_notes').delete().eq('id', note_id);
  redirect(`/crm/${lead_id}`);
}
