import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { createLead } from '../actions';
import adminStyles from '@/app/admin/admin.module.css';
import styles from '../crm.module.css';

export const metadata: Metadata = {
  title: 'Nuevo lead — CRM cancha.',
};

export default async function NewLeadPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profileData } = await supabase.from('users').select('role').eq('id', user.id).single();
  const profile = profileData as { role: string } | null;
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  return (
    <>
      <Link href="/crm" className={styles.backLink}>← Pipeline</Link>

      <header className={adminStyles.header}>
        <div className={adminStyles.headerLeft}>
          <span className={adminStyles.pageTag}>CRM</span>
          <h1 className={adminStyles.pageTitle}>Nuevo lead</h1>
        </div>
      </header>

      <form action={createLead}>
        <div className={styles.formSection}>
          <div className={styles.formGrid}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="owner_name">
                Nombre del propietario *
              </label>
              <input
                id="owner_name"
                name="owner_name"
                className={styles.formInput}
                required
                autoFocus
                placeholder="Ej. Carlos Mendoza"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="business_name">
                Nombre del negocio / cancha
              </label>
              <input
                id="business_name"
                name="business_name"
                className={styles.formInput}
                placeholder="Ej. Cancha El Rey"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="city">
                Ciudad
              </label>
              <input
                id="city"
                name="city"
                className={styles.formInput}
                placeholder="Quito, Guayaquil..."
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="phone">
                Teléfono / WhatsApp
              </label>
              <input
                id="phone"
                name="phone"
                type="tel"
                className={styles.formInput}
                placeholder="+593 99 123 4567"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="email">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                className={styles.formInput}
                placeholder="owner@cancha.com"
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="stage">
                Etapa inicial
              </label>
              <select id="stage" name="stage" className={styles.formSelect} defaultValue="nuevo">
                <option value="nuevo">Nuevo</option>
                <option value="contactado">Contactado</option>
                <option value="demo">Demo</option>
                <option value="negociacion">Negociación</option>
                <option value="ganado">Ganado</option>
                <option value="perdido">Perdido</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="source">
                Fuente
              </label>
              <select id="source" name="source" className={styles.formSelect} defaultValue="">
                <option value="">— Sin especificar</option>
                <option value="referido">Referido</option>
                <option value="instagram">Instagram</option>
                <option value="whatsapp">WhatsApp directo</option>
                <option value="feria">Feria / evento</option>
                <option value="cold_call">Llamada fría</option>
                <option value="otro">Otro</option>
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel} htmlFor="assigned_to">
                Asignado a (vendedor)
              </label>
              <input
                id="assigned_to"
                name="assigned_to"
                className={styles.formInput}
                placeholder="Nombre del vendedor"
              />
            </div>
          </div>

          <div className={styles.actionRow}>
            <button type="submit" className={styles.btnSm}>
              Crear lead
            </button>
            <Link href="/crm" className={styles.btnSmOutline}>
              Cancelar
            </Link>
          </div>
        </div>
      </form>
    </>
  );
}
