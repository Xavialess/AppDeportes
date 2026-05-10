'use client';

import { useTransition } from 'react';
import { logoutAction } from '@/app/login/actions';
import styles from './dashboard.module.css';

export function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await logoutAction();
    });
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={isPending}
      className={styles.logoutButton}
      aria-busy={isPending}
    >
      {isPending ? 'Saliendo…' : 'Cerrar sesión'}
    </button>
  );
}
