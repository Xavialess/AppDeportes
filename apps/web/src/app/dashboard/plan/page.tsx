import type { Metadata } from 'next';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import styles from './plan.module.css';

export const metadata: Metadata = {
  title: 'Mi Suscripción — cancha.',
};

type SubscriptionStatus = 'active' | 'inactive' | 'trial';

interface Plan {
  id: string;
  name: string;
  price_monthly: number;
  max_matches_per_month: number;
  is_active: boolean;
}

interface OwnerProfile {
  id: string;
  user_id: string;
  plan_id: string | null;
  subscription_status: SubscriptionStatus;
  plans: Plan | null;
}

const STATUS_LABELS: Record<SubscriptionStatus, string> = {
  active: 'Activa',
  inactive: 'Inactiva',
  trial: 'Prueba',
};

async function changePlan(formData: FormData) {
  'use server';

  const newPlanId = formData.get('plan_id') as string;
  const ownerProfileId = formData.get('owner_profile_id') as string;

  if (!newPlanId || !ownerProfileId) return;

  const admin = createAdminClient();
  await admin
    .from('owner_profiles')
    .update({ plan_id: newPlanId })
    .eq('id', ownerProfileId);

  revalidatePath('/dashboard/plan');
}

export default async function PlanPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Fetch owner profile + current plan
  const { data: ownerProfileRaw } = await supabase
    .from('owner_profiles')
    .select('id, user_id, plan_id, subscription_status, plans(id, name, price_monthly, max_matches_per_month, is_active)')
    .eq('user_id', user.id)
    .single();

  const ownerProfile = ownerProfileRaw as OwnerProfile | null;
  const currentPlan = ownerProfile?.plans ?? null;

  // Fetch owner's fields to derive match count
  const { data: fieldsData } = await supabase
    .from('fields')
    .select('id')
    .eq('owner_id', user.id);

  const fieldIds = (fieldsData ?? []).map((f) => f.id);

  // Count matches this month (non-cancelled)
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

  const { count: matchesThisMonth } = fieldIds.length > 0
    ? await supabase
        .from('matches')
        .select('id', { count: 'exact', head: true })
        .in('field_id', fieldIds)
        .gte('date', monthStart)
        .neq('status', 'cancelled')
    : { count: 0 };

  const usedCount = matchesThisMonth ?? 0;
  const maxMatches = currentPlan?.max_matches_per_month ?? 0;
  const usagePercent = maxMatches > 0 ? Math.min(100, (usedCount / maxMatches) * 100) : 0;
  const atLimit = usedCount >= maxMatches && maxMatches > 0;

  // Fetch all active plans
  const { data: plansRaw } = await supabase
    .from('plans')
    .select('id, name, price_monthly, max_matches_per_month, is_active')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true });

  const plans = (plansRaw ?? []) as Plan[];

  const subscriptionStatus = (ownerProfile?.subscription_status ?? 'inactive') as SubscriptionStatus;

  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.pageTag}>Cuenta</span>
          <h1 className={styles.pageTitle}>Mi Suscripción</h1>
        </div>
      </header>

      {/* Limit reached warning */}
      {atLimit && (
        <div className={styles.limitWarning} role="alert">
          <span className={styles.limitWarningIcon} aria-hidden="true">⚠️</span>
          <div>
            <p className={styles.limitWarningTitle}>Límite de partidos alcanzado</p>
            <p className={styles.limitWarningText}>
              Has publicado {usedCount} de {maxMatches} partidos permitidos este mes. Actualiza tu plan
              para publicar más partidos.
            </p>
          </div>
        </div>
      )}

      {/* Current plan card */}
      {ownerProfile && currentPlan ? (
        <section aria-labelledby="current-plan-heading" className={styles.currentPlanSection}>
          <h2 id="current-plan-heading" className={styles.sectionTitle}>Plan actual</h2>
          <div className={styles.currentPlanCard}>
            <div className={styles.currentPlanTop}>
              <div>
                <div className={styles.currentPlanName}>{currentPlan.name}</div>
                <div className={styles.currentPlanPrice}>
                  ${currentPlan.price_monthly.toFixed(2)}
                  <span className={styles.currentPlanPeriod}>/mes</span>
                </div>
              </div>
              <span className={`${styles.statusBadge} ${styles[`statusBadge${subscriptionStatus.charAt(0).toUpperCase()}${subscriptionStatus.slice(1)}` as keyof typeof styles]}`}>
                {STATUS_LABELS[subscriptionStatus]}
              </span>
            </div>

            <div className={styles.usageRow}>
              <div className={styles.usageLabels}>
                <span className={styles.usageLabel}>Partidos este mes</span>
                <span className={styles.usageCount}>
                  {usedCount} / {maxMatches}
                </span>
              </div>
              <div className={styles.planBar} role="progressbar" aria-valuenow={usedCount} aria-valuemin={0} aria-valuemax={maxMatches}>
                <div
                  className={`${styles.planBarFill} ${atLimit ? styles.planBarFillFull : ''}`}
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
            </div>

            <p className={styles.currentPlanMeta}>
              {maxMatches} partidos/mes · integración de pagos próximamente
            </p>
          </div>
        </section>
      ) : (
        <div className={styles.noPlanBanner}>
          <span aria-hidden="true">ℹ️</span>
          <p>No tienes un plan activo. Selecciona uno abajo para empezar.</p>
        </div>
      )}

      {/* Available plans grid */}
      {plans.length > 0 && (
        <section aria-labelledby="available-plans-heading" className={styles.plansSection}>
          <h2 id="available-plans-heading" className={styles.sectionTitle}>Planes disponibles</h2>
          <ul className={styles.plansGrid} role="list">
            {plans.map((plan) => {
              const isCurrent = plan.id === ownerProfile?.plan_id;
              return (
                <li
                  key={plan.id}
                  className={`${styles.planCard} ${isCurrent ? styles.planCardCurrent : ''}`}
                >
                  {isCurrent && (
                    <span className={styles.currentBadge} aria-label="Plan actual seleccionado">
                      Plan actual
                    </span>
                  )}
                  <div className={styles.planCardName}>{plan.name}</div>
                  <div className={styles.planCardPrice}>
                    ${plan.price_monthly.toFixed(2)}
                    <span className={styles.planCardPeriodLabel}>/mes</span>
                  </div>
                  <p className={styles.planCardFeature}>
                    {plan.max_matches_per_month} partidos/mes
                  </p>

                  {!isCurrent && ownerProfile && (
                    <form action={changePlan} className={styles.planCardForm}>
                      <input type="hidden" name="plan_id" value={plan.id} />
                      <input type="hidden" name="owner_profile_id" value={ownerProfile.id} />
                      <button type="submit" className={styles.changePlanBtn}>
                        {ownerProfile.plan_id ? 'Cambiar a este plan' : 'Seleccionar plan'}
                      </button>
                    </form>
                  )}

                  {isCurrent && (
                    <div className={styles.currentPlanTag} aria-hidden="true">
                      ✓ Suscrito
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <p className={styles.paymentNote}>
            La integración de pagos estará disponible próximamente. Los cambios de plan son inmediatos.
          </p>
        </section>
      )}
    </>
  );
}
