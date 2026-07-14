'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import styles from './marketing-nav.module.css';

const LINKS = [
  { href: '/#como-funciona', label: 'Cómo funciona' },
  { href: '/#propietarios', label: 'Propietarios' },
  { href: '/contacto', label: 'Contacto' },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  return (
    <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ''}`}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} onClick={() => setMobileOpen(false)}>
          cancha<span className={styles.brandDot}>.</span>
        </Link>

        <nav className={styles.links} aria-label="Navegación principal">
          {LINKS.map((link) =>
            link.href.startsWith('/contacto') ? (
              <Link key={link.href} href={link.href} className={styles.link}>
                {link.label}
              </Link>
            ) : (
              <a key={link.href} href={link.href} className={styles.link}>
                {link.label}
              </a>
            ),
          )}
        </nav>

        <div className={styles.actions}>
          <Link href="/login" className={styles.loginLink}>
            Ingresar
          </Link>
          <Link href="/signup" className={styles.signupButton}>
            Regístrate
          </Link>
        </div>

        <button
          type="button"
          className={styles.menuToggle}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
          onClick={() => setMobileOpen((open) => !open)}
        >
          <span className={styles.menuIcon} data-open={mobileOpen} />
        </button>
      </div>

      {mobileOpen && (
        <div className={styles.mobilePanel}>
          <nav className={styles.mobileLinks} aria-label="Navegación móvil">
            {LINKS.map((link) =>
              link.href.startsWith('/contacto') ? (
                <Link
                  key={link.href}
                  href={link.href}
                  className={styles.mobileLink}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  className={styles.mobileLink}
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </a>
              ),
            )}
          </nav>
          <div className={styles.mobileActions}>
            <Link href="/login" className={styles.loginLink} onClick={() => setMobileOpen(false)}>
              Ingresar
            </Link>
            <Link
              href="/signup"
              className={styles.signupButton}
              onClick={() => setMobileOpen(false)}
            >
              Regístrate
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
