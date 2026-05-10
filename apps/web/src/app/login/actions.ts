'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function loginAction(formData: FormData): Promise<{ error: string } | never> {
  const email = formData.get('email');
  const password = formData.get('password');

  if (typeof email !== 'string' || typeof password !== 'string') {
    return { error: 'Datos de formulario inválidos.' };
  }

  const trimmedEmail = email.trim();

  if (!trimmedEmail || !password) {
    return { error: 'El correo y la contraseña son obligatorios.' };
  }

  const supabase = await createClient();

  const { error } = await supabase.auth.signInWithPassword({
    email: trimmedEmail,
    password,
  });

  if (error) {
    return { error: 'Correo o contraseña incorrectos.' };
  }

  redirect('/dashboard');
}

export async function logoutAction(): Promise<never> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
