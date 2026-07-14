import Link from 'next/link';
import styles from './marketing-footer.module.css';

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandBlock}>
          <span className={styles.brandName}>
            cancha<span className={styles.brandDot}>.</span>
          </span>
          <p className={styles.tagline}>Encuentra y organiza partidos cerca de ti.</p>
        </div>

        <nav className={styles.linkGroup} aria-label="Enlaces del sitio">
          <span className={styles.linkGroupTitle}>Sitio</span>
          <a href="/#como-funciona">Cómo funciona</a>
          <a href="/#propietarios">Propietarios</a>
          <Link href="/contacto">Contacto</Link>
        </nav>

        <nav className={styles.linkGroup} aria-label="Cuenta">
          <span className={styles.linkGroupTitle}>Cuenta</span>
          <Link href="/login">Ingresar</Link>
          <Link href="/signup">Regístrate como propietario</Link>
        </nav>
      </div>

      <div className={styles.bottom}>
        <p>© {year} cancha. — Quito · Guayaquil, Ecuador.</p>
      </div>
    </footer>
  );
}
