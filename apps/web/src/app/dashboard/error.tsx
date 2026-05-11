'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import styles from './_error.module.css';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function DashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={styles.container}>
      <div className={styles.icon} aria-hidden="true">⚠</div>
      <h2 className={styles.title}>Algo salió mal</h2>
      <p className={styles.text}>
        Ocurrió un error al cargar esta página. Puedes intentar de nuevo o volver al panel.
      </p>
      <div className={styles.actions}>
        <button onClick={reset} className={styles.retryBtn}>
          Reintentar
        </button>
        <Link href="/dashboard" className={styles.homeLink}>
          Ir al panel
        </Link>
      </div>
    </div>
  );
}
