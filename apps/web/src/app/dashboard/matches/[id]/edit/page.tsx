'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { updateMatch } from './actions';
import styles from '../../new/new-match.module.css';

interface Field { id: string; name: string; clubs: { name: string } | null }
interface Sport { id: string; name: string; formats: string[] }

interface MatchData {
  id: string;
  type: 'open' | 'reservation';
  status: string;
  field_id: string;
  sport_id: string;
  format: string | null;
  date: string;
  start_time: string;
  end_time: string;
  price_per_player: number | null;
  min_players: number | null;
  max_players: number | null;
  confirmation_deadline: string | null;
  total_price: number | null;
}

function toDatetimeLocal(isoStr: string): string {
  // Convert ISO or Postgres timestamp to datetime-local format (YYYY-MM-DDTHH:MM)
  return isoStr.replace(' ', 'T').slice(0, 16);
}

export default function EditMatchPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const supabase = createClient();

  const [match, setMatch] = useState<MatchData | null>(null);
  const [activeEnrolledCount, setActiveEnrolledCount] = useState(0);
  const [fields, setFields] = useState<Field[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // Form state
  const [fieldId, setFieldId] = useState('');
  const [sportId, setSportId] = useState('');
  const [format, setFormat] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [pricePerPlayer, setPricePerPlayer] = useState('');
  const [minPlayers, setMinPlayers] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [deadline, setDeadline] = useState('');
  const [totalPrice, setTotalPrice] = useState('');

  const selectedSport = sports.find(s => s.id === sportId);
  const formats = selectedSport?.formats ?? [];

  useEffect(() => {
    if (!id) return;
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: clubsData } = await supabase.from('clubs').select('id').eq('owner_id', user.id);
      const clubIds = (clubsData ?? []).map((c: { id: string }) => c.id);

      const [matchRes, enrollRes, fieldsRes, sportsRes] = await Promise.all([
        supabase
          .from('matches')
          .select('id, type, status, field_id, sport_id, format, date, start_time, end_time, price_per_player, min_players, max_players, confirmation_deadline, total_price')
          .eq('id', id)
          .single(),
        supabase
          .from('enrollments')
          .select('id', { count: 'exact', head: true })
          .eq('match_id', id)
          .in('status', ['pending', 'confirmed', 'payment_pending']),
        clubIds.length > 0
          ? supabase.from('fields').select('id, name, clubs(name)').in('club_id', clubIds)
          : Promise.resolve({ data: [] as Field[], error: null }),
        supabase.from('sports').select('id, name, formats').eq('is_active', true).order('name'),
      ]);

      if (matchRes.error || !matchRes.data) { router.push('/dashboard/matches'); return; }

      const m = matchRes.data as MatchData;
      setMatch(m);
      setActiveEnrolledCount(enrollRes.count ?? 0);
      setFields((fieldsRes.data ?? []) as Field[]);
      setSports((sportsRes.data ?? []) as Sport[]);

      // Pre-populate
      setFieldId(m.field_id);
      setSportId(m.sport_id);
      setFormat(m.format ?? '');
      setDate(m.date);
      setStartTime(m.start_time.slice(0, 5));
      setEndTime(m.end_time.slice(0, 5));
      if (m.price_per_player != null) setPricePerPlayer(String(m.price_per_player));
      if (m.min_players != null) setMinPlayers(String(m.min_players));
      if (m.max_players != null) setMaxPlayers(String(m.max_players));
      if (m.confirmation_deadline) setDeadline(toDatetimeLocal(m.confirmation_deadline));
      if (m.total_price != null) setTotalPrice(String(m.total_price));

      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Reset format when sport changes (only during full edit)
  useEffect(() => {
    if (formats.length > 0 && !formats.includes(format)) {
      setFormat(formats[0]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sportId]);

  const canEditAll = match?.status === 'open' && activeEnrolledCount === 0;

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!match) return errs;

    if (match.type === 'open') {
      if (!pricePerPlayer || Number(pricePerPlayer) <= 0) errs.price_per_player = 'Ingresa un precio válido';
      if (!minPlayers || Number(minPlayers) < 2) errs.min_players = 'Mínimo 2 jugadores';
      if (!maxPlayers || Number(maxPlayers) < 2) errs.max_players = 'Mínimo 2 jugadores';
      if (minPlayers && maxPlayers && Number(maxPlayers) < Number(minPlayers)) errs.max_players = 'El máximo no puede ser menor al mínimo';
      if (Number(maxPlayers) < activeEnrolledCount) errs.max_players = `No puede ser menor que los ${activeEnrolledCount} inscritos`;
      if (!deadline) errs.deadline = 'Selecciona un plazo de confirmación';
    } else {
      if (!totalPrice || Number(totalPrice) <= 0) errs.total_price = 'Ingresa un precio válido';
    }
    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const errs = validate();
    if (Object.keys(errs).length > 0) { setFieldErrors(errs); return; }
    setFieldErrors({});
    setSubmitting(true);

    const fd = new FormData();
    if (canEditAll) {
      fd.set('field_id', fieldId);
      fd.set('sport_id', sportId);
      fd.set('format', format);
      fd.set('date', date);
      fd.set('start_time', startTime);
      fd.set('end_time', endTime);
    }
    if (match?.type === 'open') {
      fd.set('price_per_player', pricePerPlayer);
      fd.set('min_players', minPlayers);
      fd.set('max_players', maxPlayers);
      fd.set('confirmation_deadline', deadline);
    } else {
      fd.set('total_price', totalPrice);
    }

    const result = await updateMatch(id, fd);
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
    // On success, actions.ts redirects back to match detail
  }

  if (loading) {
    return (
      <div className={styles.centered}>
        <div className={styles.spinner} aria-label="Cargando..." />
      </div>
    );
  }

  if (!match) return null;

  const isReadonly = !canEditAll;

  return (
    <>
      <header className={styles.header}>
        <Link href={`/dashboard/matches/${id}`} className="back-link" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-accent)', textDecoration: 'none', display: 'block', marginBottom: 'var(--space-2)' }}>
          ← Volver al partido
        </Link>
        <h1 className={styles.pageTitle}>Editar partido</h1>
        {isReadonly && (
          <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
            {activeEnrolledCount > 0
              ? `Hay ${activeEnrolledCount} jugador${activeEnrolledCount !== 1 ? 'es' : ''} inscrito${activeEnrolledCount !== 1 ? 's' : ''}. Solo puedes editar precio, cupo máximo y plazo de confirmación.`
              : 'Solo puedes editar precio, cupo máximo y plazo mientras el partido está confirmado.'}
          </p>
        )}
      </header>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {error && <div className={styles.errorBanner} role="alert">{error}</div>}

        {/* Match type — always read-only */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Tipo de partido</legend>
          <div className={styles.typeToggle} role="group">
            <button type="button" className={`${styles.typeBtn} ${match.type === 'open' ? styles.typeBtnActive : ''}`} disabled>
              ⚽ Partido Abierto
            </button>
            <button type="button" className={`${styles.typeBtn} ${match.type === 'reservation' ? styles.typeBtnActive : ''}`} disabled>
              🏟️ Reserva completa
            </button>
          </div>
        </fieldset>

        <div className={styles.formGrid}>
          {/* Left column */}
          <div className={styles.col}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="field_id">Cancha</label>
              {canEditAll ? (
                <select id="field_id" className={styles.select} value={fieldId} onChange={e => setFieldId(e.target.value)} required>
                  {fields.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.clubs?.name ? `${f.clubs.name} — ` : ''}{f.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input className={styles.input} value={fields.find(f => f.id === fieldId)?.name ?? fieldId} readOnly disabled />
              )}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="sport_id">Deporte</label>
              {canEditAll ? (
                <select id="sport_id" className={styles.select} value={sportId} onChange={e => setSportId(e.target.value)} required>
                  {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <input className={styles.input} value={sports.find(s => s.id === sportId)?.name ?? sportId} readOnly disabled />
              )}
            </div>

            {formats.length > 0 && (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="format">Formato</label>
                {canEditAll ? (
                  <select id="format" className={styles.select} value={format} onChange={e => setFormat(e.target.value)} required>
                    {formats.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                ) : (
                  <input className={styles.input} value={format} readOnly disabled />
                )}
              </div>
            )}

            <div className={styles.field}>
              <label className={styles.label} htmlFor="date">Fecha</label>
              <input
                id="date"
                type="date"
                className={styles.input}
                value={date}
                onChange={e => setDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                readOnly={!canEditAll}
                disabled={!canEditAll}
              />
            </div>

            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="start_time">Hora inicio</label>
                <input
                  id="start_time"
                  type="time"
                  className={styles.input}
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  readOnly={!canEditAll}
                  disabled={!canEditAll}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="end_time">Hora fin</label>
                <input
                  id="end_time"
                  type="time"
                  className={styles.input}
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  readOnly={!canEditAll}
                  disabled={!canEditAll}
                />
              </div>
            </div>
          </div>

          {/* Right column */}
          <div className={styles.col}>
            {match.type === 'open' ? (
              <>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="price_per_player">Precio por jugador ($)</label>
                  <input
                    id="price_per_player"
                    type="number"
                    min="0.01"
                    step="0.01"
                    className={styles.input}
                    value={pricePerPlayer}
                    onChange={e => setPricePerPlayer(e.target.value)}
                    placeholder="8.00"
                  />
                  {fieldErrors.price_per_player && <span className={styles.fieldError}>{fieldErrors.price_per_player}</span>}
                </div>

                <div className={styles.twoCol}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="min_players">Mínimo jugadores</label>
                    <input
                      id="min_players"
                      type="number"
                      min="2"
                      className={styles.input}
                      value={minPlayers}
                      onChange={e => setMinPlayers(e.target.value)}
                      placeholder="8"
                    />
                    {fieldErrors.min_players && <span className={styles.fieldError}>{fieldErrors.min_players}</span>}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="max_players">Máximo jugadores</label>
                    <input
                      id="max_players"
                      type="number"
                      min={activeEnrolledCount > 0 ? activeEnrolledCount : 2}
                      className={styles.input}
                      value={maxPlayers}
                      onChange={e => setMaxPlayers(e.target.value)}
                      placeholder="10"
                    />
                    {fieldErrors.max_players && <span className={styles.fieldError}>{fieldErrors.max_players}</span>}
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="deadline">Plazo de confirmación</label>
                  <input
                    id="deadline"
                    type="datetime-local"
                    className={styles.input}
                    value={deadline}
                    onChange={e => setDeadline(e.target.value)}
                  />
                  {fieldErrors.deadline && <span className={styles.fieldError}>{fieldErrors.deadline}</span>}
                  <p className={styles.hint}>Si no se llega al mínimo antes de esta fecha, el partido se cancela automáticamente.</p>
                </div>
              </>
            ) : (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="total_price">Precio total ($)</label>
                <input
                  id="total_price"
                  type="number"
                  min="0.01"
                  step="0.01"
                  className={styles.input}
                  value={totalPrice}
                  onChange={e => setTotalPrice(e.target.value)}
                  placeholder="80.00"
                />
                {fieldErrors.total_price && <span className={styles.fieldError}>{fieldErrors.total_price}</span>}
              </div>
            )}
          </div>
        </div>

        <div className={styles.formFooter}>
          <button type="button" className={styles.cancelBtn} onClick={() => router.push(`/dashboard/matches/${id}`)} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
    </>
  );
}
