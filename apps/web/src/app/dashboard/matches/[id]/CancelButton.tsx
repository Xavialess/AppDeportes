'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import styles from '../matches.module.css';

interface CancelButtonProps {
  matchId: string;
  className?: string;
}

export default function CancelButton({ matchId, className }: CancelButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);

  if (confirming) {
    return (
      <div className={styles.confirmRow}>
        <span className={styles.confirmText}>¿Confirmar cancelación? Esta acción no se puede deshacer.</span>
        <div className={styles.confirmActions}>
          <button
            onClick={() => setConfirming(false)}
            className={styles.confirmCancel}
          >
            No
          </button>
          <button
            onClick={() => router.push(`/dashboard/matches/${matchId}?cancel=1`)}
            className={styles.confirmProceed}
          >
            Sí, cancelar
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className={`${styles.cancelBtn} ${className ?? ''}`}
    >
      Cancelar partido
    </button>
  );
}
