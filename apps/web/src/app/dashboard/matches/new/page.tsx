'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { createMatch } from './actions';
import styles from './new-match.module.css';

interface Field { id: string; name: string; clubs: { name: string } | null }
interface Sport { id: string; name: string; formats: string[] }

export default function NewMatchPage() {
  const router = useRouter();
  const supabase = createClient();

  const [fields, setFields] = useState<Field[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [type, setType] = useState<'open' | 'reservation'>('open');
  const [fieldId, setFieldId] = useState('');
  const [sportId, setSportId] = useState('');
  const [format, setFormat] = useState('');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [pricePerPlayer, setPricePerPlayer] = useState('');
  const [minPlayers, setMinPlayers] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [deadline, setDeadline] = useState('');
  const [totalPrice, setTotalPrice] = useState('');

  const selectedSport = sports.find(s => s.id === sportId);
  const formats = selectedSport?.formats ?? [];

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      // Fetch owner's clubs first, then their fields
      const { data: clubsData } = await supabase
        .from('clubs').select('id').eq('owner_id', user.id);
      const clubIds = (clubsData ?? []).map((c: { id: string }) => c.id);

      const [fieldsResult, { data: sportsData }] = await Promise.all([
        clubIds.length > 0
          ? supabase.from('fields').select('id, name, clubs(name)').in('club_id', clubIds)
          : Promise.resolve({ data: [] as Field[] }),
        supabase.from('sports').select('id, name, formats').eq('is_active', true).order('name'),
      ]);
      const fieldsData = fieldsResult.data as Field[] | null;
      setFields(fieldsData ?? []);
      setSports(sportsData ?? []);
      if (fieldsData?.[0]) setFieldId(fieldsData[0].id);
      if (sportsData?.[0]) { setSportId(sportsData[0].id); setFormat(sportsData[0].formats?.[0] ?? ''); }
      setLoading(false);
    }
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (formats.length > 0) setFormat(formats[0]);
  }, [sportId]); // eslint-disable-line react-hooks/exhaustive-deps

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!date) errs.date = 'Selecciona una fecha';
    if (!startTime) errs.start_time = 'Ingresa la hora de inicio';
    if (!endTime) errs.end_time = 'Ingresa la hora de fin';
    if (startTime && endTime && endTime <= startTime) errs.end_time = 'La hora de fin debe ser después del inicio';
    if (type === 'open') {
      if (!pricePerPlayer || Number(pricePerPlayer) <= 0) errs.price_per_player = 'Ingresa un precio válido';
      if (!minPlayers || Number(minPlayers) < 2) errs.min_players = 'Mínimo 2 jugadores';
      if (!maxPlayers || Number(maxPlayers) < 2) errs.max_players = 'Mínimo 2 jugadores';
      if (minPlayers && maxPlayers && Number(maxPlayers) < Number(minPlayers)) errs.max_players = 'El máximo no puede ser menor al mínimo';
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
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const fd = new FormData();
    fd.set('type', type);
    fd.set('field_id', fieldId);
    fd.set('sport_id', sportId);
    fd.set('format', format);
    fd.set('date', date);
    fd.set('start_time', startTime);
    fd.set('end_time', endTime);
    fd.set('is_visible', String(isVisible));
    if (type === 'open') {
      fd.set('price_per_player', pricePerPlayer);
      fd.set('min_players', minPlayers);
      fd.set('max_players', maxPlayers);
      fd.set('confirmation_deadline', deadline);
    } else {
      fd.set('total_price', totalPrice);
    }

    const result = await createMatch(fd);
    if (result?.error) {
      setError(result.error);
      setSubmitting(false);
    }
    // On success, actions.ts redirects — no need to handle here
  }

  if (loading) {
    return (
      <div className={styles.centered}>
        <div className={styles.spinner} aria-label="Cargando..." />
      </div>
    );
  }

  if (fields.length === 0) {
    return (
      <div className={styles.emptyFields}>
        <p className={styles.emptyFieldsTitle}>Necesitas una cancha primero</p>
        <p className={styles.emptyFieldsText}>
          Para publicar un partido debes tener al menos una cancha registrada.
        </p>
        <a href="/dashboard/fields/new" className={styles.emptyFieldsLink}>
          + Registrar cancha
        </a>
      </div>
    );
  }

  return (
    <>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>Publicar partido</h1>
      </header>

      <form onSubmit={handleSubmit} className={styles.form} noValidate>
        {error && (
          <div className={styles.errorBanner} role="alert">{error}</div>
        )}

        {/* Type toggle */}
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Tipo de partido</legend>
          <div className={styles.typeToggle} role="group">
            <button
              type="button"
              className={`${styles.typeBtn} ${type === 'open' ? styles.typeBtnActive : ''}`}
              onClick={() => setType('open')}
            >
              ⚽ Partido Abierto
            </button>
            <button
              type="button"
              className={`${styles.typeBtn} ${type === 'reservation' ? styles.typeBtnActive : ''}`}
              onClick={() => setType('reservation')}
            >
              🏟️ Reserva completa
            </button>
          </div>
        </fieldset>

        <div className={styles.formGrid}>
          {/* Left column */}
          <div className={styles.col}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="field_id">Cancha</label>
              <select id="field_id" className={styles.select} value={fieldId} onChange={e => setFieldId(e.target.value)} required>
                {fields.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.clubs?.name ? `${f.clubs.name} — ` : ''}{f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="sport_id">Deporte</label>
              <select id="sport_id" className={styles.select} value={sportId} onChange={e => setSportId(e.target.value)} required>
                {sports.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="format">Formato</label>
              <select id="format" className={styles.select} value={format} onChange={e => setFormat(e.target.value)} required disabled={formats.length === 0}>
                {formats.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="date">Fecha</label>
              <input id="date" type="date" className={styles.input} value={date} onChange={e => setDate(e.target.value)} min={new Date().toISOString().slice(0, 10)} />
              {fieldErrors.date && <span className={styles.fieldError}>{fieldErrors.date}</span>}
            </div>

            <div className={styles.twoCol}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="start_time">Hora inicio</label>
                <input id="start_time" type="time" className={styles.input} value={startTime} onChange={e => setStartTime(e.target.value)} />
                {fieldErrors.start_time && <span className={styles.fieldError}>{fieldErrors.start_time}</span>}
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="end_time">Hora fin</label>
                <input id="end_time" type="time" className={styles.input} value={endTime} onChange={e => setEndTime(e.target.value)} />
                {fieldErrors.end_time && <span className={styles.fieldError}>{fieldErrors.end_time}</span>}
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.checkLabel}>
                <input type="checkbox" checked={isVisible} onChange={e => setIsVisible(e.target.checked)} className={styles.checkbox} />
                Visible al público
              </label>
              <p className={styles.hint}>Los jugadores pueden ver y unirse a este partido.</p>
            </div>
          </div>

          {/* Right column — conditional */}
          <div className={styles.col}>
            {type === 'open' ? (
              <>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="price_per_player">Precio por jugador ($)</label>
                  <input id="price_per_player" type="number" min="0.01" step="0.01" className={styles.input} value={pricePerPlayer} onChange={e => setPricePerPlayer(e.target.value)} placeholder="8.00" />
                  {fieldErrors.price_per_player && <span className={styles.fieldError}>{fieldErrors.price_per_player}</span>}
                </div>

                <div className={styles.twoCol}>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="min_players">Mínimo jugadores</label>
                    <input id="min_players" type="number" min="2" className={styles.input} value={minPlayers} onChange={e => setMinPlayers(e.target.value)} placeholder="8" />
                    {fieldErrors.min_players && <span className={styles.fieldError}>{fieldErrors.min_players}</span>}
                  </div>
                  <div className={styles.field}>
                    <label className={styles.label} htmlFor="max_players">Máximo jugadores</label>
                    <input id="max_players" type="number" min="2" className={styles.input} value={maxPlayers} onChange={e => setMaxPlayers(e.target.value)} placeholder="10" />
                    {fieldErrors.max_players && <span className={styles.fieldError}>{fieldErrors.max_players}</span>}
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.label} htmlFor="deadline">Plazo de confirmación</label>
                  <input id="deadline" type="datetime-local" className={styles.input} value={deadline} onChange={e => setDeadline(e.target.value)} />
                  {fieldErrors.deadline && <span className={styles.fieldError}>{fieldErrors.deadline}</span>}
                  <p className={styles.hint}>Si no se llega al mínimo antes de esta fecha, el partido se cancela automáticamente.</p>
                </div>
              </>
            ) : (
              <div className={styles.field}>
                <label className={styles.label} htmlFor="total_price">Precio total ($)</label>
                <input id="total_price" type="number" min="0.01" step="0.01" className={styles.input} value={totalPrice} onChange={e => setTotalPrice(e.target.value)} placeholder="80.00" />
                {fieldErrors.total_price && <span className={styles.fieldError}>{fieldErrors.total_price}</span>}
              </div>
            )}
          </div>
        </div>

        <div className={styles.formFooter}>
          <button type="button" className={styles.cancelBtn} onClick={() => router.back()} disabled={submitting}>
            Cancelar
          </button>
          <button type="submit" className={styles.submitBtn} disabled={submitting}>
            {submitting ? 'Publicando…' : 'Publicar partido'}
          </button>
        </div>
      </form>
    </>
  );
}
