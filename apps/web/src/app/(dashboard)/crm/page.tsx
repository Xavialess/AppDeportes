import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { CrmBoard, type Lead } from './CrmBoard';
import adminStyles from '@/app/admin/admin.module.css';
import styles from './crm.module.css';

export const metadata: Metadata = {
  title: 'CRM — cancha.',
};

const STAGE_LABEL: Record<string, string> = {
  nuevo:       'Nuevo',
  contactado:  'Contactado',
  demo:        'Demo',
  negociacion: 'Negociación',
  ganado:      'Ganado',
  perdido:     'Perdido',
};

export default async function CrmPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profileData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const profile = profileData as { role: string } | null;
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const { data: leads } = await admin
    .from('crm_leads')
    .select('id, owner_name, business_name, city, stage, source, assigned_to, notes_count, created_at')
    .order('created_at', { ascending: false });

  const allLeads = (leads ?? []) as Lead[];

  // Stats
  const total       = allLeads.length;
  const won         = allLeads.filter((l) => l.stage === 'ganado').length;
  const demos       = allLeads.filter((l) => l.stage === 'demo' || l.stage === 'negociacion' || l.stage === 'ganado').length;
  const contacted   = allLeads.filter((l) => l.stage !== 'nuevo').length;
  const contactPct  = total > 0 ? Math.round((contacted / total) * 100) : 0;

  // Unique cities for filter dropdown
  const cities = [...new Set(allLeads.map((l) => l.city).filter(Boolean) as string[])].sort();

  // Stage distribution for a quick pill bar
  const stageCounts = Object.entries(STAGE_LABEL).map(([key, label]) => ({
    key,
    label,
    count: allLeads.filter((l) => l.stage === key).length,
  }));

  return (
    <>
      <header className={adminStyles.header}>
        <div className={adminStyles.headerLeft}>
          <span className={adminStyles.pageTag}>Ventas</span>
          <h1 className={adminStyles.pageTitle}>Pipeline CRM</h1>
        </div>
      </header>

      {/* Stats bar */}
      <div className={styles.statsBar}>
        <div className={styles.statCard} style={{ '--card-accent': 'var(--color-accent)' } as React.CSSProperties}>
          <div className={styles.statLabel}>Total leads</div>
          <div className={styles.statValue}>{total}</div>
        </div>
        <div className={styles.statCard} style={{ '--card-accent': 'oklch(68% 0.2 200)' } as React.CSSProperties}>
          <div className={styles.statLabel}>Contactados</div>
          <div className={styles.statValue}>{contactPct}%</div>
          <div className={styles.statSub}>{contacted} de {total}</div>
        </div>
        <div className={styles.statCard} style={{ '--card-accent': 'oklch(70% 0.22 290)' } as React.CSSProperties}>
          <div className={styles.statLabel}>En demo / negoc.</div>
          <div className={styles.statValue}>{demos}</div>
        </div>
        <div className={styles.statCard} style={{ '--card-accent': 'oklch(68% 0.18 155)' } as React.CSSProperties}>
          <div className={styles.statLabel}>Ganados</div>
          <div className={styles.statValue}>{won}</div>
          <div className={styles.statSub}>
            {total > 0 ? Math.round((won / total) * 100) : 0}% conversión
          </div>
        </div>
      </div>

      {/* Stage distribution pills */}
      {total > 0 && (
        <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginBottom: 'var(--space-5)' }}>
          {stageCounts.filter((s) => s.count > 0).map((s) => {
            const cssMap: Record<string, string> = {
              nuevo: 'stageNuevo', contactado: 'stageContactado', demo: 'stageDemo',
              negociacion: 'stageNegociacion', ganado: 'stageGanado', perdido: 'stagePerdido',
            };
            return (
              <span key={s.key} className={`${styles.stageBadge} ${styles[cssMap[s.key] ?? '']}`}>
                {s.label} · {s.count}
              </span>
            );
          })}
        </div>
      )}

      {/* Board (Kanban / List) — client for view toggle + filters */}
      <CrmBoard leads={allLeads} cities={cities} />
    </>
  );
}
