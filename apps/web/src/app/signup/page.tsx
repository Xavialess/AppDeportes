import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './signup.module.css';
import { SignupForm } from './SignupForm';
import { SportBackground } from '@/components/SportBackground';

export const metadata: Metadata = {
  title: 'Crear cuenta — cancha.',
};

export default function SignupPage() {
  return (
    <main className={styles.page}>
      <SportBackground />

      <section className={styles.card} aria-labelledby="signup-heading">
        <div className={styles.brand}>
          <span className={styles.brandName}>
            cancha<span className={styles.brandDot}>.</span>
          </span>
          <p className={styles.brandTagline}>Tu próximo partido empieza acá</p>
        </div>

        <h1 id="signup-heading" className={styles.heading}>
          Crea tu cuenta
        </h1>
        <p className={styles.subheading}>
          Regístrate como propietario de cancha
        </p>

        <SignupForm />

        <p className={styles.footerNote}>
          ¿Ya tienes cuenta?{' '}
          <Link href="/login">Inicia sesión</Link>
        </p>
      </section>
    </main>
  );
}
