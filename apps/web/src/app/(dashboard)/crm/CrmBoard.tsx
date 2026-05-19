'use client';

import { useState } from 'react';
import Link from 'next/link';
import styles from './crm.module.css';

export const STAGES = [
  { key: 'nuevo',        label: 'Nuevo' },
  { key: 'contactado',   label: 'Contactado' },
  { key: 'demo',         label: 'Demo' },
  { key: 'negociacion',  label: 'Negociación' },
  { key: 'ganado',       label: 'Ganado' },
  { key: 'perdido',      label: 'Perdido' },
] as const;

type Stage = typeof STAGES[number]['key'];

export interface Lead {
  id: string;
  owner_name: string;
  business_name: string | null;
  city: string | null;
  stage: Stage;
  source: string | null;
  assigned_to: string | null;
  notes_count: number;
  created_at: string;
}

interface Props {
  leads: Lead[];
  cities: string[];
  initialStage?: string;
}

const STAGE_CSS: Record<string, string> = {
  nuevo:        'stageNuevo',
  contactado:   'stageContactado',
  demo:         'stageDemo',
  negociacion:  'stageNegociacion',
  ganado:       'stageGanado',
  perdido:      'stagePerdido',
};

export function CrmBoard({ leads, cities, initialStage }: Props) {
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [stageFilter, setStageFilter] = useState(initialStage ?? '');
  const [cityFilter, setCityFilter] = useState('');

  const filtered = leads.filter((l) => {
    if (stageFilter && l.stage !== stageFilter) return false;
    if (cityFilter && l.city !== cityFilter) return false;
    return true;
  });

  const byStage = (stage: string) => filtered.filter((l) => l.stage === stage);

  return (
    <>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <select
            className={styles.filterSelect}
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            aria-label="Filtrar por etapa"
          >
            <option value="">Todas las etapas</option>
            {STAGES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>

          <select
            className={styles.filterSelect}
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            aria-label="Filtrar por ciudad"
          >
            <option value="">Todas las ciudades</option>
            {cities.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div className={styles.toolbarRight}>
          <div className={styles.viewToggle} role="group" aria-label="Vista">
            <button
              className={`${styles.viewBtn} ${view === 'kanban' ? styles.viewBtnActive : ''}`}
              onClick={() => setView('kanban')}
            >
              Kanban
            </button>
            <button
              className={`${styles.viewBtn} ${view === 'list' ? styles.viewBtnActive : ''}`}
              onClick={() => setView('list')}
            >
              Lista
            </button>
          </div>

          <Link href="/crm/new" className={styles.btnNew}>
            + Nuevo lead
          </Link>
        </div>
      </div>

      {/* Kanban */}
      {view === 'kanban' && (
        <div className={styles.kanban}>
          {STAGES.map(({ key, label }) => {
            const colLeads = byStage(key);
            const cssKey = STAGE_CSS[key] ?? '';
            return (
              <div key={key} className={styles.kanbanCol}>
                <div className={`${styles.kanbanHeader} ${styles[cssKey]}`}>
                  <span className={`${styles.kanbanStageLabel} ${styles[cssKey]}`}>
                    {label}
                  </span>
                  <span className={styles.kanbanCount}>{colLeads.length}</span>
                </div>

                {colLeads.length === 0 ? (
                  <div className={styles.kanbanEmpty}>Sin leads</div>
                ) : (
                  colLeads.map((lead) => (
                    <Link
                      key={lead.id}
                      href={`/crm/${lead.id}`}
                      className={styles.leadCard}
                    >
                      <div className={styles.leadName}>{lead.owner_name}</div>
                      {lead.business_name && (
                        <div className={styles.leadBusiness}>{lead.business_name}</div>
                      )}
                      <div className={styles.leadMeta}>
                        {lead.city && (
                          <span className={styles.leadCity}>{lead.city}</span>
                        )}
                        {lead.notes_count > 0 && (
                          <span className={styles.leadNotes}>
                            {lead.notes_count} nota{lead.notes_count !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* List */}
      {view === 'list' && (
        <div className={styles.listWrapper}>
          <table className={styles.listTable}>
            <thead>
              <tr>
                <th>Propietario</th>
                <th>Negocio</th>
                <th>Ciudad</th>
                <th>Etapa</th>
                <th>Fuente</th>
                <th>Asignado a</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className={styles.listEmpty}>
                    Sin leads para los filtros seleccionados.
                  </td>
                </tr>
              )}
              {filtered.map((lead) => {
                const cssKey = STAGE_CSS[lead.stage] ?? '';
                const stageLabel = STAGES.find((s) => s.key === lead.stage)?.label ?? lead.stage;
                return (
                  <tr
                    key={lead.id}
                    onClick={() => window.location.assign(`/crm/${lead.id}`)}
                  >
                    <td style={{ fontWeight: 600 }}>{lead.owner_name}</td>
                    <td style={{ color: 'var(--color-text-muted)' }}>
                      {lead.business_name ?? '—'}
                    </td>
                    <td style={{ color: 'var(--color-text-muted)' }}>{lead.city ?? '—'}</td>
                    <td>
                      <span className={`${styles.stageBadge} ${styles[cssKey]}`}>
                        {stageLabel}
                      </span>
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>
                      {lead.source ?? '—'}
                    </td>
                    <td style={{ color: 'var(--color-text-muted)' }}>
                      {lead.assigned_to ?? '—'}
                    </td>
                    <td style={{ color: 'var(--color-text-muted)', textAlign: 'center' }}>
                      {lead.notes_count}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
