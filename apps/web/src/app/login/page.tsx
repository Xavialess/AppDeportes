import type { Metadata } from 'next';
import styles from './login.module.css';
import { LoginForm } from './LoginForm';

export const metadata: Metadata = {
  title: 'Iniciar sesión — cancha.',
};

interface LoginPageProps {
  searchParams: Promise<{ error?: string; redirectTo?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: 'Tu cuenta no tiene acceso al panel de propietarios.',
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? null) : null;

  return (
    <main className={styles.page}>
      <section className={styles.card} aria-labelledby="login-heading">
        <div className={styles.brand}>
          <span className={styles.brandName}>
            cancha<span className={styles.brandDot}>.</span>
          </span>
        </div>

        <h1 id="login-heading" className={styles.heading}>
          Bienvenido de vuelta
        </h1>
        <p className={styles.subheading}>
          Accede al panel de propietarios
        </p>

        {errorMessage && (
          <div className={styles.errorBanner} role="alert">
            <span aria-hidden="true">⚠</span>
            {errorMessage}
          </div>
        )}

        <LoginForm />

        <p className={styles.footerNote}>
          ¿Problemas para acceder?{' '}
          <a href="mailto:soporte@cancha.ec">Contacta al soporte</a>
        </p>
      </section>
    </main>
  );
}
