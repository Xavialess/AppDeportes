import { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../../../lib/supabase';
import { colors, radius, spacing } from '../../../lib/theme';
import CanchaLoader from '../../../components/CanchaLoader';

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

type ActivePicker = 'date' | 'startTime' | 'endTime' | 'deadlineDate' | 'deadlineTime' | null;

interface Field {
  id: string;
  name: string;
  clubs: { name: string } | null;
}

interface Sport {
  id: string;
  name: string;
  formats: string[];
}

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

function formatDateDisplay(d: Date): string {
  return `${DAYS_ES[d.getDay()]}, ${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTimeDisplay(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

function dateToString(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateStr(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseTimeStr(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d;
}

function parseDeadlineStr(deadlineStr: string): { dateObj: Date; timeObj: Date } {
  const normalized = deadlineStr.replace('T', ' ');
  const [datePart, timePart] = normalized.split(' ');
  return {
    dateObj: parseDateStr(datePart),
    timeObj: parseTimeStr(timePart),
  };
}

function isFutureDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  const matchDay = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return matchDay >= today;
}

function deadlineBeforeKickoff(deadlineStr: string, dateStr: string, startTimeStr: string): boolean {
  const deadline = new Date(deadlineStr.replace(' ', 'T'));
  const kickoff = new Date(`${dateStr}T${startTimeStr}`);
  return deadline < kickoff;
}

export default function EditMatchScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [match, setMatch] = useState<MatchData | null>(null);
  const [activeEnrolledCount, setActiveEnrolledCount] = useState(0);
  const [fields, setFields] = useState<Field[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  // Form state
  const [fieldIndex, setFieldIndex] = useState(0);
  const [sportIndex, setSportIndex] = useState(0);
  const [formatIndex, setFormatIndex] = useState(0);

  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [confirmationDeadline, setConfirmationDeadline] = useState('');

  const [dateObj, setDateObj] = useState<Date | null>(null);
  const [startTimeObj, setStartTimeObj] = useState<Date | null>(null);
  const [endTimeObj, setEndTimeObj] = useState<Date | null>(null);
  const [deadlineDateObj, setDeadlineDateObj] = useState<Date | null>(null);
  const [deadlineTimeObj, setDeadlineTimeObj] = useState<Date | null>(null);

  const [activePicker, setActivePicker] = useState<ActivePicker>(null);

  const [pricePerPlayer, setPricePerPlayer] = useState('');
  const [minPlayers, setMinPlayers] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [totalPrice, setTotalPrice] = useState('');

  useEffect(() => {
    if (!id) return;
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function loadAll() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [matchRes, enrollmentsRes, clubsRes, sportsRes] = await Promise.all([
        supabase
          .from('matches')
          .select('id, type, status, field_id, sport_id, format, date, start_time, end_time, price_per_player, min_players, max_players, confirmation_deadline, total_price')
          .eq('id', id)
          .single(),
        supabase
          .from('enrollments')
          .select('id')
          .eq('match_id', id)
          .in('status', ['pending', 'confirmed', 'payment_pending']),
        supabase.from('clubs').select('id').eq('owner_id', user.id),
        supabase.from('sports').select('id, name, formats').eq('is_active', true),
      ]);

      if (matchRes.error) throw matchRes.error;
      if (sportsRes.error) throw sportsRes.error;

      const fetchedMatch = matchRes.data as MatchData;
      const enrolledCount = (enrollmentsRes.data ?? []).length;
      const clubIds = (clubsRes.data ?? []).map((c: { id: string }) => c.id);

      const fieldsRes = clubIds.length > 0
        ? await supabase.from('fields').select('id, name, clubs(name)').in('club_id', clubIds)
        : { data: [], error: null };

      if (fieldsRes.error) throw fieldsRes.error;

      const fetchedFields = (fieldsRes.data ?? []) as Field[];
      const fetchedSports = (sportsRes.data ?? []) as Sport[];

      setMatch(fetchedMatch);
      setActiveEnrolledCount(enrolledCount);
      setFields(fetchedFields);
      setSports(fetchedSports);

      // Pre-populate form
      const fieldIdx = fetchedFields.findIndex((f) => f.id === fetchedMatch.field_id);
      setFieldIndex(fieldIdx >= 0 ? fieldIdx : 0);

      const sportIdx = fetchedSports.findIndex((s) => s.id === fetchedMatch.sport_id);
      setSportIndex(sportIdx >= 0 ? sportIdx : 0);

      if (sportIdx >= 0 && fetchedMatch.format) {
        const fmtIdx = fetchedSports[sportIdx].formats.indexOf(fetchedMatch.format);
        setFormatIndex(fmtIdx >= 0 ? fmtIdx : 0);
      }

      setDate(fetchedMatch.date);
      setDateObj(parseDateStr(fetchedMatch.date));

      const st = fetchedMatch.start_time.slice(0, 5);
      const et = fetchedMatch.end_time.slice(0, 5);
      setStartTime(st);
      setEndTime(et);
      setStartTimeObj(parseTimeStr(st));
      setEndTimeObj(parseTimeStr(et));

      if (fetchedMatch.confirmation_deadline) {
        const { dateObj: dlDate, timeObj: dlTime } = parseDeadlineStr(fetchedMatch.confirmation_deadline);
        setDeadlineDateObj(dlDate);
        setDeadlineTimeObj(dlTime);
        setConfirmationDeadline(`${dateToString(dlDate)} ${formatTimeDisplay(dlTime)}`);
      }

      if (fetchedMatch.price_per_player != null) {
        setPricePerPlayer(String(fetchedMatch.price_per_player));
      }
      if (fetchedMatch.min_players != null) {
        setMinPlayers(String(fetchedMatch.min_players));
      }
      if (fetchedMatch.max_players != null) {
        setMaxPlayers(String(fetchedMatch.max_players));
      }
      if (fetchedMatch.total_price != null) {
        setTotalPrice(String(fetchedMatch.total_price));
      }
    } catch {
      setError('No se pudo cargar el partido.');
    } finally {
      setLoading(false);
    }
  }

  // Full edit is only allowed when open with no active enrollments
  const canEditAll = match?.status === 'open' && activeEnrolledCount === 0;

  const selectedSport = sports[sportIndex] ?? null;
  const availableFormats = selectedSport?.formats ?? [];

  function handleSportChange(direction: 'prev' | 'next') {
    const newIndex =
      direction === 'next'
        ? Math.min(sportIndex + 1, sports.length - 1)
        : Math.max(sportIndex - 1, 0);
    setSportIndex(newIndex);
    setFormatIndex(0);
  }

  function buildDeadlineString(dDate: Date | null, dTime: Date | null): string {
    if (!dDate || !dTime) return '';
    return `${dateToString(dDate)} ${formatTimeDisplay(dTime)}`;
  }

  function handlePickerChange(picker: ActivePicker, event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed') { setActivePicker(null); return; }
    if (!selected) return;
    if (Platform.OS === 'android') setActivePicker(null);

    switch (picker) {
      case 'date':
        setDateObj(selected);
        setDate(dateToString(selected));
        break;
      case 'startTime':
        setStartTimeObj(selected);
        setStartTime(formatTimeDisplay(selected));
        break;
      case 'endTime':
        setEndTimeObj(selected);
        setEndTime(formatTimeDisplay(selected));
        break;
      case 'deadlineDate':
        setDeadlineDateObj(selected);
        setConfirmationDeadline(buildDeadlineString(selected, deadlineTimeObj));
        break;
      case 'deadlineTime':
        setDeadlineTimeObj(selected);
        setConfirmationDeadline(buildDeadlineString(deadlineDateObj, selected));
        break;
    }
  }

  function validate(): string | null {
    if (!match) return 'Datos no disponibles.';

    if (canEditAll) {
      if (!date) return 'La fecha es obligatoria.';
      if (!isFutureDate(date)) return 'La fecha debe ser hoy o en el futuro.';
      if (!startTime) return 'La hora de inicio es obligatoria.';
      if (!endTime) return 'La hora de fin es obligatoria.';
      if (startTime >= endTime) return 'La hora de fin debe ser posterior a la de inicio.';
    }

    if (match.type === 'open') {
      if (!pricePerPlayer) return 'El precio por jugador es obligatorio.';
      if (isNaN(Number(pricePerPlayer)) || Number(pricePerPlayer) < 0) return 'Precio por jugador inválido.';
      if (!minPlayers) return 'Los jugadores mínimos son obligatorios.';
      if (!maxPlayers) return 'Los jugadores máximos son obligatorios.';
      const min = parseInt(minPlayers, 10);
      const max = parseInt(maxPlayers, 10);
      if (isNaN(min) || min < 1) return 'Jugadores mínimos inválidos.';
      if (isNaN(max) || max < 1) return 'Jugadores máximos inválidos.';
      if (min > max) return 'Los jugadores mínimos no pueden superar los máximos.';
      if (max < activeEnrolledCount) {
        return `Máximo no puede ser menor que los jugadores ya inscritos (${activeEnrolledCount}).`;
      }
      if (!confirmationDeadline) return 'El plazo de confirmación es obligatorio.';
      if (canEditAll && !deadlineBeforeKickoff(confirmationDeadline, date, startTime)) {
        return 'El plazo debe ser antes de la hora de inicio del partido.';
      }
    }

    if (match.type === 'reservation') {
      if (!totalPrice) return 'El precio total es obligatorio.';
      if (isNaN(Number(totalPrice)) || Number(totalPrice) < 0) return 'Precio total inválido.';
    }

    return null;
  }

  async function handleSave() {
    setError(null);
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    if (!match) return;

    setSubmitting(true);
    try {
      const updates: Record<string, unknown> = {};

      if (canEditAll) {
        updates.field_id = fields[fieldIndex]?.id;
        updates.sport_id = selectedSport?.id;
        updates.format = availableFormats.length > 0 ? availableFormats[formatIndex] : null;
        updates.date = date;
        updates.start_time = startTime;
        updates.end_time = endTime;
      }

      if (match.type === 'open') {
        updates.price_per_player = Number(pricePerPlayer);
        updates.min_players = parseInt(minPlayers, 10);
        updates.max_players = parseInt(maxPlayers, 10);
        updates.confirmation_deadline = confirmationDeadline.replace(' ', 'T');
      } else {
        updates.total_price = Number(totalPrice);
      }

      const { error: updateError } = await supabase
        .from('matches')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update(updates as any)
        .eq('id', match.id);

      if (updateError) throw updateError;

      setSuccess(true);
      setTimeout(() => router.back(), 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar los cambios.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function confirmDiscard() {
    Alert.alert(
      'Descartar cambios',
      '¿Seguro que quieres salir sin guardar?',
      [
        { text: 'Seguir editando', style: 'cancel' },
        { text: 'Descartar', style: 'destructive', onPress: () => router.back() },
      ]
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <CanchaLoader variant="full" />
      </View>
    );
  }

  if (error && !match) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorLarge}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={loadAll}>
          <Text style={styles.retryButtonText}>Reintentar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (success) {
    return (
      <View style={styles.centered}>
        <View style={styles.successCircle}>
          <Ionicons name="checkmark" size={36} color={colors.accentFg} />
        </View>
        <Text style={styles.successTitle}>¡Cambios guardados!</Text>
        <Text style={styles.successText}>Volviendo al partido…</Text>
      </View>
    );
  }

  if (!match) return null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={confirmDiscard} style={styles.backArrow}>
            <Text style={styles.backArrowText}>← Volver</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Editar partido</Text>
          {!canEditAll && (
            <Text style={styles.restrictedNote}>
              {activeEnrolledCount > 0
                ? `Hay ${activeEnrolledCount} jugador${activeEnrolledCount !== 1 ? 'es' : ''} inscrito${activeEnrolledCount !== 1 ? 's' : ''}. Solo puedes editar precio, cupo máximo y plazo.`
                : 'Solo puedes editar precio, cupo máximo y plazo mientras el partido está confirmado.'}
            </Text>
          )}
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Match type — read-only */}
        <View style={styles.section}>
          <Text style={styles.label}>Tipo de partido</Text>
          <View style={styles.readonlyRow}>
            <Text style={styles.readonlyText}>
              {match.type === 'open' ? 'Abierto' : 'Reserva'}
            </Text>
            <Text style={styles.readonlyHint}>No se puede cambiar</Text>
          </View>
        </View>

        {/* Field picker — editable only when no enrollments */}
        <View style={styles.section}>
          <Text style={styles.label}>Cancha</Text>
          {canEditAll ? (
            <View style={styles.pickerRow}>
              <TouchableOpacity
                style={styles.pickerArrow}
                onPress={() => setFieldIndex((i) => Math.max(i - 1, 0))}
                disabled={fieldIndex === 0}
              >
                <Text style={[styles.pickerArrowText, fieldIndex === 0 && styles.arrowDisabled]}>‹</Text>
              </TouchableOpacity>
              <View style={styles.pickerValue}>
                <Text style={styles.pickerValueText} numberOfLines={1}>{fields[fieldIndex]?.name ?? '—'}</Text>
                {fields[fieldIndex]?.clubs?.name ? (
                  <Text style={styles.pickerValueSub} numberOfLines={1}>{fields[fieldIndex].clubs!.name}</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.pickerArrow}
                onPress={() => setFieldIndex((i) => Math.min(i + 1, fields.length - 1))}
                disabled={fieldIndex === fields.length - 1}
              >
                <Text style={[styles.pickerArrowText, fieldIndex === fields.length - 1 && styles.arrowDisabled]}>›</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.readonlyRow}>
              <Text style={styles.readonlyText}>{fields[fieldIndex]?.name ?? '—'}</Text>
              {fields[fieldIndex]?.clubs?.name ? (
                <Text style={styles.readonlyHint}>{fields[fieldIndex].clubs!.name}</Text>
              ) : null}
            </View>
          )}
        </View>

        {/* Sport picker — editable only when no enrollments */}
        <View style={styles.section}>
          <Text style={styles.label}>Deporte</Text>
          {canEditAll ? (
            <View style={styles.pickerRow}>
              <TouchableOpacity
                style={styles.pickerArrow}
                onPress={() => handleSportChange('prev')}
                disabled={sportIndex === 0}
              >
                <Text style={[styles.pickerArrowText, sportIndex === 0 && styles.arrowDisabled]}>‹</Text>
              </TouchableOpacity>
              <View style={styles.pickerValue}>
                <Text style={styles.pickerValueText}>{selectedSport?.name ?? '—'}</Text>
              </View>
              <TouchableOpacity
                style={styles.pickerArrow}
                onPress={() => handleSportChange('next')}
                disabled={sportIndex === sports.length - 1}
              >
                <Text style={[styles.pickerArrowText, sportIndex === sports.length - 1 && styles.arrowDisabled]}>›</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.readonlyRow}>
              <Text style={styles.readonlyText}>{selectedSport?.name ?? '—'}</Text>
            </View>
          )}
        </View>

        {/* Format picker — editable only when no enrollments */}
        {availableFormats.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Formato</Text>
            {canEditAll ? (
              <View style={styles.pickerRow}>
                <TouchableOpacity
                  style={styles.pickerArrow}
                  onPress={() => setFormatIndex((i) => Math.max(i - 1, 0))}
                  disabled={formatIndex === 0}
                >
                  <Text style={[styles.pickerArrowText, formatIndex === 0 && styles.arrowDisabled]}>‹</Text>
                </TouchableOpacity>
                <View style={styles.pickerValue}>
                  <Text style={styles.pickerValueText}>{availableFormats[formatIndex] ?? '—'}</Text>
                </View>
                <TouchableOpacity
                  style={styles.pickerArrow}
                  onPress={() => setFormatIndex((i) => Math.min(i + 1, availableFormats.length - 1))}
                  disabled={formatIndex === availableFormats.length - 1}
                >
                  <Text style={[styles.pickerArrowText, formatIndex === availableFormats.length - 1 && styles.arrowDisabled]}>›</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.readonlyRow}>
                <Text style={styles.readonlyText}>{availableFormats[formatIndex] ?? '—'}</Text>
              </View>
            )}
          </View>
        )}

        {/* Date — editable only when no enrollments */}
        <View style={styles.section}>
          <Text style={styles.label}>Fecha</Text>
          {canEditAll ? (
            <>
              <TouchableOpacity
                style={styles.input}
                onPress={() => setActivePicker(activePicker === 'date' ? null : 'date')}
                disabled={submitting}
                activeOpacity={0.7}
              >
                <Text style={dateObj ? styles.inputValueText : styles.inputPlaceholderText}>
                  {dateObj ? formatDateDisplay(dateObj) : 'Selecciona una fecha'}
                </Text>
              </TouchableOpacity>
              {activePicker === 'date' && (
                <DateTimePicker
                  value={dateObj ?? new Date()}
                  mode="date"
                  minimumDate={new Date()}
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(event, selected) => handlePickerChange('date', event, selected)}
                />
              )}
            </>
          ) : (
            <View style={styles.readonlyRow}>
              <Text style={styles.readonlyText}>{dateObj ? formatDateDisplay(dateObj) : date}</Text>
            </View>
          )}
        </View>

        {/* Start / end time — editable only when no enrollments */}
        <View style={styles.row2}>
          <View style={[styles.section, styles.rowHalf]}>
            <Text style={styles.label}>Inicio</Text>
            {canEditAll ? (
              <>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => setActivePicker(activePicker === 'startTime' ? null : 'startTime')}
                  disabled={submitting}
                  activeOpacity={0.7}
                >
                  <Text style={startTimeObj ? styles.inputValueText : styles.inputPlaceholderText}>
                    {startTimeObj ? formatTimeDisplay(startTimeObj) : 'HH:MM'}
                  </Text>
                </TouchableOpacity>
                {activePicker === 'startTime' && (
                  <DateTimePicker
                    value={startTimeObj ?? new Date()}
                    mode="time"
                    is24Hour
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selected) => handlePickerChange('startTime', event, selected)}
                  />
                )}
              </>
            ) : (
              <View style={styles.readonlyRow}>
                <Text style={styles.readonlyText}>{startTime || '—'}</Text>
              </View>
            )}
          </View>
          <View style={[styles.section, styles.rowHalf]}>
            <Text style={styles.label}>Fin</Text>
            {canEditAll ? (
              <>
                <TouchableOpacity
                  style={styles.input}
                  onPress={() => setActivePicker(activePicker === 'endTime' ? null : 'endTime')}
                  disabled={submitting}
                  activeOpacity={0.7}
                >
                  <Text style={endTimeObj ? styles.inputValueText : styles.inputPlaceholderText}>
                    {endTimeObj ? formatTimeDisplay(endTimeObj) : 'HH:MM'}
                  </Text>
                </TouchableOpacity>
                {activePicker === 'endTime' && (
                  <DateTimePicker
                    value={endTimeObj ?? new Date()}
                    mode="time"
                    is24Hour
                    display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                    onChange={(event, selected) => handlePickerChange('endTime', event, selected)}
                  />
                )}
              </>
            ) : (
              <View style={styles.readonlyRow}>
                <Text style={styles.readonlyText}>{endTime || '—'}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Open match editable fields */}
        {match.type === 'open' && (
          <>
            <View style={styles.section}>
              <Text style={styles.label}>Precio por jugador</Text>
              <View style={styles.prefixInputRow}>
                <View style={styles.prefix}>
                  <Text style={styles.prefixText}>$</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.inputWithPrefix]}
                  value={pricePerPlayer}
                  onChangeText={setPricePerPlayer}
                  placeholder="0.00"
                  placeholderTextColor={colors.dim}
                  keyboardType="decimal-pad"
                  editable={!submitting}
                />
              </View>
            </View>

            <View style={styles.row2}>
              <View style={[styles.section, styles.rowHalf]}>
                <Text style={styles.label}>Mín. jugadores</Text>
                <TextInput
                  style={styles.input}
                  value={minPlayers}
                  onChangeText={setMinPlayers}
                  placeholder="6"
                  placeholderTextColor={colors.dim}
                  keyboardType="number-pad"
                  editable={!submitting}
                  maxLength={3}
                />
              </View>
              <View style={[styles.section, styles.rowHalf]}>
                <Text style={styles.label}>Máx. jugadores</Text>
                <TextInput
                  style={styles.input}
                  value={maxPlayers}
                  onChangeText={setMaxPlayers}
                  placeholder="10"
                  placeholderTextColor={colors.dim}
                  keyboardType="number-pad"
                  editable={!submitting}
                  maxLength={3}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Plazo de confirmación</Text>
              <View style={styles.row2}>
                <View style={styles.rowHalf}>
                  <TouchableOpacity
                    style={styles.input}
                    onPress={() => setActivePicker(activePicker === 'deadlineDate' ? null : 'deadlineDate')}
                    disabled={submitting}
                    activeOpacity={0.7}
                  >
                    <Text style={deadlineDateObj ? styles.inputValueText : styles.inputPlaceholderText}>
                      {deadlineDateObj ? formatDateDisplay(deadlineDateObj) : 'Fecha'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.rowHalf}>
                  <TouchableOpacity
                    style={styles.input}
                    onPress={() => setActivePicker(activePicker === 'deadlineTime' ? null : 'deadlineTime')}
                    disabled={submitting}
                    activeOpacity={0.7}
                  >
                    <Text style={deadlineTimeObj ? styles.inputValueText : styles.inputPlaceholderText}>
                      {deadlineTimeObj ? formatTimeDisplay(deadlineTimeObj) : 'HH:MM'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              {activePicker === 'deadlineDate' && (
                <DateTimePicker
                  value={deadlineDateObj ?? new Date()}
                  mode="date"
                  minimumDate={new Date()}
                  display={Platform.OS === 'ios' ? 'inline' : 'default'}
                  onChange={(event, selected) => handlePickerChange('deadlineDate', event, selected)}
                />
              )}
              {activePicker === 'deadlineTime' && (
                <DateTimePicker
                  value={deadlineTimeObj ?? new Date()}
                  mode="time"
                  is24Hour
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={(event, selected) => handlePickerChange('deadlineTime', event, selected)}
                />
              )}
              <Text style={styles.hint}>Debe ser antes de la fecha del partido</Text>
            </View>
          </>
        )}

        {/* Reservation editable field */}
        {match.type === 'reservation' && (
          <View style={styles.section}>
            <Text style={styles.label}>Precio total</Text>
            <View style={styles.prefixInputRow}>
              <View style={styles.prefix}>
                <Text style={styles.prefixText}>$</Text>
              </View>
              <TextInput
                style={[styles.input, styles.inputWithPrefix]}
                value={totalPrice}
                onChangeText={setTotalPrice}
                placeholder="0.00"
                placeholderTextColor={colors.dim}
                keyboardType="decimal-pad"
                editable={!submitting}
              />
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.saveButton, submitting && styles.buttonDisabled]}
          onPress={handleSave}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <CanchaLoader variant="button" />
          ) : (
            <Text style={styles.saveButtonText}>Guardar cambios</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
    paddingHorizontal: 32,
  },
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: 56,
    paddingBottom: 40,
  },
  header: { marginBottom: spacing.xl },
  backArrow: { marginBottom: spacing.md },
  backArrowText: { fontSize: 15, color: colors.accent, fontWeight: '600' },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
  },
  restrictedNote: {
    marginTop: spacing.sm,
    fontSize: 13,
    color: colors.mute,
    lineHeight: 18,
  },
  errorBox: {
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: { color: colors.error, fontSize: 14, fontWeight: '500' },
  section: { marginBottom: spacing.lg },
  label: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.dim,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    fontSize: 15,
    color: colors.text,
    justifyContent: 'center',
  },
  inputValueText: { fontSize: 15, color: colors.text },
  inputPlaceholderText: { fontSize: 15, color: colors.dim },
  readonlyRow: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  readonlyText: { fontSize: 15, color: colors.mute },
  readonlyHint: { fontSize: 12, color: colors.dim },
  hint: { fontSize: 11, color: colors.dim, marginTop: 5 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  pickerArrow: { paddingHorizontal: spacing.lg, paddingVertical: 14 },
  pickerArrowText: { fontSize: 22, color: colors.accent, fontWeight: '700' },
  arrowDisabled: { color: colors.line2 },
  pickerValue: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm },
  pickerValueText: { fontSize: 15, fontWeight: '600', color: colors.text },
  pickerValueSub: { fontSize: 12, color: colors.mute, marginTop: 2 },
  prefixInputRow: { flexDirection: 'row', alignItems: 'center' },
  prefix: {
    backgroundColor: colors.card2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRightWidth: 0,
    borderTopLeftRadius: radius.card,
    borderBottomLeftRadius: radius.card,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  prefixText: { fontSize: 16, fontWeight: '700', color: colors.mute },
  inputWithPrefix: { flex: 1, borderTopLeftRadius: 0, borderBottomLeftRadius: 0 },
  row2: { flexDirection: 'row', gap: spacing.md },
  rowHalf: { flex: 1 },
  saveButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: { opacity: 0.6 },
  saveButtonText: { color: colors.accentFg, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  errorLarge: { fontSize: 15, color: colors.error, textAlign: 'center', marginBottom: spacing.lg },
  retryButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  retryButtonText: { color: colors.accentFg, fontWeight: '700', fontSize: 14 },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  successTitle: { fontSize: 22, fontWeight: '800', color: colors.text, marginBottom: spacing.sm, textAlign: 'center' },
  successText: { fontSize: 14, color: colors.mute, textAlign: 'center' },
});
