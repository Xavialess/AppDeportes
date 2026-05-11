import styles from '../dashboard/_skeleton.module.css';

export default function AdminLoading() {
  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.skeletonTag} />
        <div className={styles.skeletonTitle} />
      </div>
      <div className={styles.cardGrid}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={styles.skeletonCard} />
        ))}
      </div>
      <div className={styles.listGroup}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className={styles.skeletonRow} />
        ))}
      </div>
    </div>
  );
}
