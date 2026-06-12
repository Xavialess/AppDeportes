'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export type SignupState =
  | { status: 'idle' }
  | { status: 'error'; message: string }
  | { status: 'email_sent' };

export async function signupAction(_prev: SignupState, formData: FormData): Promise<SignupState> {
  const name = formData.get('name');
  const email = formData.get('email');
  const password = formData.get('password');
  const confirmPassword = formData.get('confirmPassword');

  if (
    typeof name !== 'string' ||
    typeof email !== 'string' ||
    typeof password !== 'string' ||
    typeof confirmPassword !== 'string'
  ) {
    return { status: 'error', message: 'Datos de formulario inválidos.' };
  }

  const trimmedName = name.trim();
  const trimmedEmail = email.trim();

  if (!trimmedName) {
    return { status: 'error', message: 'El nombre es obligatorio.' };
  }

  if (!trimmedEmail) {
    return { status: 'error', message: 'El correo electrónico es obligatorio.' };
  }

  if (password.length < 8) {
    return { status: 'error', message: 'La contraseña debe tener al menos 8 caracteres.' };
  }

  if (password !== confirmPassword) {
    return { status: 'error', message: 'Las contraseñas no coinciden.' };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email: trimmedEmail,
    password,
    options: {
      data: {
        name: trimmedName,
        role: 'owner',
      },
    },
  });

  if (error) {
    if (error.code === 'user_already_exists' || error.message?.includes('already registered')) {
      return { status: 'error', message: 'Ya existe una cuenta con este correo. Inicia sesión.' };
    }
    return { status: 'error', message: 'No se pudo crear la cuenta. Inténtalo de nuevo.' };
  }

  // Email confirmation disabled in dev → session is immediately available
  if (data.session) {
    redirect('/dashboard');
  }

  // Email confirmation enabled in prod → ask user to check inbox
  return { status: 'email_sent' };
}
