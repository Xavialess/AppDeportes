'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from '@/app/(dashboard)/dashboard.module.css';

interface NavLinkProps {
  href: string;
  icon: string;
  label: string;
  /** If true, only exact path match activates the item. Default: prefix match. */
  exact?: boolean;
}

export function NavLink({ href, icon, label, exact = false }: NavLinkProps) {
  const pathname = usePathname();
  const isActive = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
      aria-current={isActive ? 'page' : undefined}
    >
      <span className={styles.navIcon} aria-hidden="true">{icon}</span>
      {label}
    </Link>
  );
}
