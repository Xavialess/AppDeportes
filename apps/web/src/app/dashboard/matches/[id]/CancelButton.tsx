'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelMatchAction } from './actions';
import styles from '../matches.module.css';

interface CancelButtonProps {
  matchId: string;
  className?: string;
}

export default function CancelButton({ matchId, className }: CancelButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      const result = await cancelMatchAction(matchId);
      if (result.error) {
        setError(result.error);
      } else {
        setConfirming(false);
        router.refresh();
      }
    });
  }

  if (confirming) {
    return (
      <div className={styles.confirmRow}>
        <span className={styles.confirmText}>¿Confirmar cancelación? Esta acción no se puede deshacer.</span>
        {error && <span className={styles.confirmError}>{error}</span>}
        <div className={styles.confirmActions}>
          <button
            onClick={() => setConfirming(false)}
            className={styles.confirmCancel}
            disabled={isPending}
          >
            No
          </button>
          <button
            onClick={handleConfirm}
            className={styles.confirmProceed}
            disabled={isPending}
          >
            {isPending ? 'Cancelando…' : 'Sí, cancelar'}
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
