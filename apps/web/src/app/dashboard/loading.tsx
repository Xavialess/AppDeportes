import styles from './_skeleton.module.css';

export default function DashboardLoading() {
  return (
    <div className={styles.page}>
      {/* Page header skeleton */}
      <div className={styles.header}>
        <div className={styles.skeletonTag} />
        <div className={styles.skeletonTitle} />
      </div>
      {/* Summary cards skeleton */}
      <div className={styles.cardGrid}>
        {[0, 1, 2].map((i) => (
          <div key={i} className={styles.skeletonCard} />
        ))}
      </div>
      {/* List rows skeleton */}
      <div className={styles.listGroup}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={styles.skeletonRow} />
        ))}
      </div>
    </div>
  );
}
