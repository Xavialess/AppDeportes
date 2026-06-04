'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './mobile-nav.module.css';

interface NavItem {
  icon: JSX.Element;
  label: string;
  href: string;
  exact: boolean;
}

interface MobileNavProps {
  items: NavItem[];
  userInitials: string;
  userName: string;
  roleLabel: string;
}

export function MobileNav({ items, userInitials, userName, roleLabel }: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close on route change
  useEffect(() => { setOpen(false); }, [pathname]);

  // Prevent body scroll when open
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <>
      <button
        className={styles.hamburger}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
        aria-expanded={open}
      >
        <span className={`${styles.bar} ${open ? styles.barOpen1 : ''}`} />
        <span className={`${styles.bar} ${open ? styles.barOpen2 : ''}`} />
        <span className={`${styles.bar} ${open ? styles.barOpen3 : ''}`} />
      </button>

      {open && (
        <div className={styles.overlay} onClick={() => setOpen(false)} aria-hidden="true" />
      )}

      <nav
        className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
        aria-label="Menú de navegación"
      >
        <div className={styles.drawerHeader}>
          <div className={styles.drawerUser}>
            <div className={styles.drawerAvatar}>{userInitials}</div>
            <div>
              <div className={styles.drawerName}>{userName}</div>
              <div className={styles.drawerRole}>{roleLabel}</div>
            </div>
          </div>
          <button
            className={styles.closeBtn}
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            ✕
          </button>
        </div>

        <ul className={styles.drawerNav} role="list">
          {items.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`${styles.drawerItem} ${isActive(item.href, item.exact) ? styles.drawerItemActive : ''}`}
              >
                <span className={styles.drawerIcon}>{item.icon}</span>
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
