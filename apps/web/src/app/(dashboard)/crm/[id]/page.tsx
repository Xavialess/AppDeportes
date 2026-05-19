import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { updateLead, deleteLead, changeStage, addNote, deleteNote } from '../actions';
import adminStyles from '@/app/admin/admin.module.css';
import styles from '../crm.module.css';

export const metadata: Metadata = { title: 'Lead — CRM cancha.' };

const STAGES = [
  { key: 'nuevo',       label: 'Nuevo' },
  { key: 'contactado',  label: 'Contactado' },
  { key: 'demo',        label: 'Demo' },
  { key: 'negociacion', label: 'Negociación' },
  { key: 'ganado',      label: 'Ganado' },
  { key: 'perdido',     label: 'Perdido' },
] as const;

const STAGE_CSS: Record<string, string> = {
  nuevo: 'stageNuevo', contactado: 'stageContactado', demo: 'stageDemo',
  negociacion: 'stageNegociacion', ganado: 'stageGanado', perdido: 'stagePerdido',
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString('es-EC', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function LeadDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { edit } = await searchParams;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profileData } = await supabase.from('users').select('role, name').eq('id', user.id).single();
  const profile = profileData as { role: string; name: string | null } | null;
  if (profile?.role !== 'admin') redirect('/login?error=unauthorized');

  const admin = createAdminClient();
  const [{ data: lead }, { data: notes }] = await Promise.all([
    admin.from('crm_leads')
      .select('id, owner_name, business_name, city, phone, email, stage, source, assigned_to, notes_count, created_at, updated_at')
      .eq('id', id)
      .single(),
    admin.from('crm_notes')
      .select('id, body, created_by, created_at')
      .eq('lead_id', id)
      .order('created_at', { ascending: false }),
  ]);

  if (!lead) notFound();

  const stageLabel = STAGES.find((s) => s.key === lead.stage)?.label ?? lead.stage;
  const cssKey = STAGE_CSS[lead.stage] ?? '';
  const adminName = profile?.name ?? 'Admin';
  const isEditing = edit === '1';

  return (
    <>
      <Link href="/crm" className={styles.backLink}>← Pipeline</Link>

      <header className={adminStyles.header}>
        <div className={adminStyles.headerLeft}>
          <span className={adminStyles.pageTag}>Lead</span>
          <h1 className={adminStyles.pageTitle}>{lead.owner_name}</h1>
        </div>
        <div className={styles.actionRow}>
          {!isEditing && (
            <Link href={`/crm/${id}?edit=1`} className={styles.btnSmOutline}>
              Editar
            </Link>
          )}
          <form action={deleteLead} onSubmit={(e) => {
            if (!confirm(`¿Eliminar el lead de ${lead.owner_name}? Esta acción no se puede deshacer.`)) {
              e.preventDefault();
            }
          }}>
            <input type="hidden" name="id" value={id} />
            <button type="submit" className={styles.btnDanger}>Eliminar</button>
          </form>
        </div>
      </header>

      <div className={styles.detailGrid}>
        {/* Left: lead info + stage + edit form */}
        <div>
          {isEditing ? (
            /* Edit form */
            <form action={updateLead}>
              <div className={styles.formSection}>
                <input type="hidden" name="id" value={id} />
                <div className={styles.formGrid}>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="owner_name">
                      Nombre del propietario *
                    </label>
                    <input
                      id="owner_name" name="owner_name" className={styles.formInput}
                      defaultValue={lead.owner_name} required
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="business_name">
                      Nombre del negocio
                    </label>
                    <input
                      id="business_name" name="business_name" className={styles.formInput}
                      defaultValue={lead.business_name ?? ''}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="city">Ciudad</label>
                    <input
                      id="city" name="city" className={styles.formInput}
                      defaultValue={lead.city ?? ''}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="phone">Teléfono</label>
                    <input
                      id="phone" name="phone" type="tel" className={styles.formInput}
                      defaultValue={lead.phone ?? ''}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="email">Email</label>
                    <input
                      id="email" name="email" type="email" className={styles.formInput}
                      defaultValue={lead.email ?? ''}
                    />
                  </div>
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel} htmlFor="source">Fuente</label>
                    <select id="source" name="source" className={styles.formSelect}
                      defaultValue={lead.source ?? ''}>
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
                      Asignado a
                    </label>
                    <input
                      id="assigned_to" name="assigned_to" className={styles.formInput}
                      defaultValue={lead.assigned_to ?? ''}
                    />
                  </div>
                </div>
                <div className={styles.actionRow}>
                  <button type="submit" className={styles.btnSm}>Guardar cambios</button>
                  <Link href={`/crm/${id}`} className={styles.btnSmOutline}>Cancelar</Link>
                </div>
              </div>
            </form>
          ) : (
            /* Read-only view */
            <div className={styles.detailCard}>
              {lead.business_name && (
                <div className={styles.detailBusiness}>{lead.business_name}</div>
              )}
              <div className={styles.detailFields}>
                <div className={styles.detailField}>
                  <label>Ciudad</label>
                  <p className={!lead.city ? styles.empty : ''}>{lead.city ?? '—'}</p>
                </div>
                <div className={styles.detailField}>
                  <label>Teléfono</label>
                  <p className={!lead.phone ? styles.empty : ''}>
                    {lead.phone
                      ? <a href={`tel:${lead.phone}`} style={{ color: 'inherit' }}>{lead.phone}</a>
                      : '—'}
                  </p>
                </div>
                <div className={styles.detailField}>
                  <label>Email</label>
                  <p className={!lead.email ? styles.empty : ''}>
                    {lead.email
                      ? <a href={`mailto:${lead.email}`} style={{ color: 'inherit' }}>{lead.email}</a>
                      : '—'}
                  </p>
                </div>
                <div className={styles.detailField}>
                  <label>Fuente</label>
                  <p className={!lead.source ? styles.empty : ''}>{lead.source ?? '—'}</p>
                </div>
                <div className={styles.detailField}>
                  <label>Asignado a</label>
                  <p className={!lead.assigned_to ? styles.empty : ''}>{lead.assigned_to ?? '—'}</p>
                </div>
                <div className={styles.detailField}>
                  <label>Creado</label>
                  <p>{fmt(lead.created_at)}</p>
                </div>
                <div className={styles.detailField}>
                  <label>Última actualización</label>
                  <p>{fmt(lead.updated_at)}</p>
                </div>
              </div>
            </div>
          )}

          {/* Stage selector */}
          <div className={styles.detailCard} style={{ marginTop: 'var(--space-4)' }}>
            <div className={styles.stageSelector}>
              <div className={styles.stageSelectorLabel}>Etapa actual</div>
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <span className={`${styles.stageBadge} ${styles[cssKey]}`}>{stageLabel}</span>
              </div>
              <div className={styles.stageButtons}>
                {STAGES.map(({ key, label }) => {
                  const ck = STAGE_CSS[key] ?? '';
                  const isActive = lead.stage === key;
                  return (
                    <form key={key} action={changeStage}>
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="stage" value={key} />
                      <button
                        type="submit"
                        disabled={isActive}
                        className={`${styles.stageBtn} ${isActive ? `${styles.stageBtnActive} ${styles[ck]}` : ''}`}
                      >
                        {label}
                      </button>
                    </form>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right: notes feed */}
        <div>
          <div className={styles.notesCard}>
            <div className={styles.notesHeader}>
              Notas · <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>
                {notes?.length ?? 0}
              </span>
            </div>

            <div className={styles.notesList}>
              {(!notes || notes.length === 0) && (
                <div className={styles.notesEmpty}>
                  Aún no hay notas. Agrega la primera abajo.
                </div>
              )}
              {(notes ?? []).map((note) => (
                <div key={note.id} className={styles.noteItem}>
                  <div className={styles.noteMeta}>
                    <span className={styles.noteAuthor}>{note.created_by}</span>
                    <span className={styles.noteDate}>{fmt(note.created_at)}</span>
                  </div>
                  <p className={styles.noteBody}>{note.body}</p>
                  <form action={deleteNote} style={{ marginTop: 'var(--space-2)' }}>
                    <input type="hidden" name="note_id" value={note.id} />
                    <input type="hidden" name="lead_id" value={id} />
                    <button
                      type="submit"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: 'var(--text-xs)',
                        color: 'var(--color-text-dim)',
                        padding: 0,
                      }}
                    >
                      Eliminar nota
                    </button>
                  </form>
                </div>
              ))}
            </div>

            {/* Add note */}
            <form action={addNote} className={styles.addNoteForm}>
              <input type="hidden" name="lead_id" value={id} />
              <input type="hidden" name="created_by" value={adminName} />
              <textarea
                name="body"
                className={styles.noteTextarea}
                placeholder="Agregar una nota..."
                required
              />
              <button type="submit" className={styles.btnSm} style={{ alignSelf: 'flex-end' }}>
                Agregar nota
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
