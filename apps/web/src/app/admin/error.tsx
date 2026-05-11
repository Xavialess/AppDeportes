'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from '../dashboard/_error.module.css';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function AdminError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.container}>
      <div className={styles.icon} aria-hidden="true">⚠</div>
      <h2 className={styles.title}>Error en el panel de administración</h2>
      <p className={styles.text}>
        Ocurrió un error al cargar esta sección. Puedes intentar de nuevo o volver al inicio.
      </p>
      <div className={styles.actions}>
        <button onClick={reset} className={styles.retryBtn}>
          Reintentar
        </button>
        <Link href="/admin" className={styles.homeLink}>
          Ir al admin
        </Link>
      </div>
    </div>
  );
}
