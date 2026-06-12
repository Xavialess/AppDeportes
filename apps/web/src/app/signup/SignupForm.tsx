'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signupAction, type SignupState } from './actions';
import styles from './signup.module.css';

const initialState: SignupState = { status: 'idle' };

export function SignupForm() {
  const [state, formAction, isPending] = useActionState<SignupState, FormData>(
    signupAction,
    initialState,
  );

  if (state.status === 'email_sent') {
    return (
      <div className={styles.emailSent}>
        <div className={styles.emailSentIcon} aria-hidden="true">✉</div>
        <h2 className={styles.emailSentTitle}>Revisa tu correo</h2>
        <p className={styles.emailSentText}>
          Te enviamos un enlace de confirmación. Haz clic en él para activar tu cuenta.
        </p>
        <Link href="/login" className={styles.backLink}>
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  return (
    <form className={styles.form} action={formAction} noValidate>
      {state.status === 'error' && (
        <div className={styles.errorBanner} role="alert" aria-live="assertive">
          <span aria-hidden="true">⚠</span>
          {state.message}
        </div>
      )}

      <div className={styles.fieldGroup}>
        <label htmlFor="name" className={styles.label}>
          Nombre completo
        </label>
        <input
          id="name"
          name="name"
          type="text"
          autoComplete="name"
          required
          placeholder="María García"
          className={styles.input}
          disabled={isPending}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="email" className={styles.label}>
          Correo electrónico
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="propietario@ejemplo.com"
          className={styles.input}
          disabled={isPending}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="password" className={styles.label}>
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          placeholder="Mínimo 8 caracteres"
          className={styles.input}
          disabled={isPending}
        />
      </div>

      <div className={styles.fieldGroup}>
        <label htmlFor="confirmPassword" className={styles.label}>
          Confirmar contraseña
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          placeholder="Repite tu contraseña"
          className={styles.input}
          disabled={isPending}
        />
      </div>

      <button
        type="submit"
        className={styles.submitButton}
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? 'Creando cuenta…' : 'Crear cuenta de propietario'}
      </button>
    </form>
  );
}
