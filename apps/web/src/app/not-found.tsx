import Link from 'next/link';
import styles from './not-found.module.css';

export default function NotFound() {
  return (
    <div className={styles.page}>
      <div className={styles.content}>
        <div className={styles.brand}>
          cancha<span className={styles.brandDot}>.</span>
        </div>
        <div className={styles.code} aria-hidden="true">404</div>
        <h1 className={styles.title}>Esta página no existe.</h1>
        <p className={styles.text}>
          Es posible que la URL sea incorrecta o que la página haya sido eliminada.
        </p>
        <Link href="/dashboard" className={styles.cta}>
          Ir al panel →
        </Link>
      </div>
    </div>
  );
}
