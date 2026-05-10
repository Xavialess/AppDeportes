'use client';

import { useActionState } from 'react';
import { loginAction } from './actions';
import styles from './login.module.css';

interface ActionState {
  error: string;
}

const initialState: ActionState = { error: '' };

export function LoginForm() {
  const [state, formAction, isPending] = useActionState<ActionState, FormData>(
    async (_prev: ActionState, formData: FormData) => {
      const result = await loginAction(formData);
      // loginAction either returns an error object or redirects (never returns on success)
      return result ?? initialState;
    },
    initialState,
  );

  return (
    <form className={styles.form} action={formAction} noValidate>
      {state.error && (
        <div className={styles.errorBanner} role="alert" aria-live="assertive">
          <span aria-hidden="true">⚠</span>
          {state.error}
        </div>
      )}

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
          aria-describedby={state.error ? 'login-error' : undefined}
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
          autoComplete="current-password"
          required
          placeholder="••••••••"
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
        {isPending ? 'Iniciando sesión…' : 'Iniciar sesión'}
      </button>
    </form>
  );
}
