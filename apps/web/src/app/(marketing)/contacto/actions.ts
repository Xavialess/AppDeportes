'use server';

import { createAdminClient } from '@/lib/supabase/admin';

export type ContactState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'success' };

const CONTACT_TYPES = ['player', 'owner', 'other'] as const;
type ContactType = (typeof CONTACT_TYPES)[number];

const RATE_LIMIT_WINDOW_MINUTES = 10;
const RATE_LIMIT_MAX_SUBMISSIONS = 3;
const MESSAGE_MAX_LENGTH = 2000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isContactType(value: string): value is ContactType {
  return (CONTACT_TYPES as readonly string[]).includes(value);
}

export async function contactAction(
  _prev: ContactState,
  formData: FormData,
): Promise<ContactState> {
  // Honeypot — hidden from real users; bots that fill every field trip this.
  // Return success without inserting, so the bot has no signal to react to.
  const honeypot = formData.get('company');
  if (typeof honeypot === 'string' && honeypot.trim() !== '') {
    return { status: 'success' };
  }

  const name = formData.get('name');
  const email = formData.get('email');
  const contactType = formData.get('contactType');
  const message = formData.get('message');

  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof contactType !== 'string' ||
    typeof message !== 'string'
  ) {
    return { status: 'error', message: 'Datos de formulario inválidos.' };
  }

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const trimmedMessage = message.trim();

  if (!trimmedName) {
    return { status: 'error', message: 'El nombre es obligatorio.' };
  }

  if (!EMAIL_PATTERN.test(trimmedEmail)) {
    return { status: 'error', message: 'Ingresa un correo electrónico válido.' };
  }

  if (!isContactType(contactType)) {
    return { status: 'error', message: 'Selecciona una opción válida.' };
  }

  if (!trimmedMessage) {
    return { status: 'error', message: 'El mensaje es obligatorio.' };
  }

  if (trimmedMessage.length > MESSAGE_MAX_LENGTH) {
    return {
      status: 'error',
      message: `El mensaje no puede superar los ${MESSAGE_MAX_LENGTH} caracteres.`,
    };
  }

  const supabase = createAdminClient();

  const windowStart = new Date(
    Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();

  const { count, error: countError } = await supabase
    .from('contact_messages')
    .select('id', { count: 'exact', head: true })
    .eq('email', trimmedEmail)
    .gte('created_at', windowStart);

  if (countError) {
    console.error('contactAction: failed to check rate limit', countError);
    return { status: 'error', message: 'Algo salió mal, intenta de nuevo.' };
  }

  if ((count ?? 0) >= RATE_LIMIT_MAX_SUBMISSIONS) {
    return {
      status: 'error',
      message: 'Ya recibimos tu mensaje, te responderemos pronto.',
    };
  }

  const { error: insertError } = await supabase.from('contact_messages').insert({
    name: trimmedName,
    email: trimmedEmail,
    contact_type: contactType,
    message: trimmedMessage,
  });

  if (insertError) {
    console.error('contactAction: failed to insert contact message', insertError);
    return { status: 'error', message: 'Algo salió mal, intenta de nuevo.' };
  }

  return { status: 'success' };
}
