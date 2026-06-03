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
  ActivityIndicator,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../hooks/useSession';
import { colors, radius, spacing } from '../../lib/theme';

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

type MatchType = 'open' | 'reservation';
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

function isFutureDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return d > new Date();
}

function deadlineBeforeMatch(deadlineStr: string, dateStr: string): boolean {
  const deadline = new Date(deadlineStr.replace(' ', 'T'));
  const matchDate = new Date(dateStr);
  return deadline < matchDate;
}

export default function PostMatchScreen() {
  const { user } = useSession();

  const [fields, setFields] = useState<Field[]>([]);
  const [sports, setSports] = useState<Sport[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [noFields, setNoFields] = useState(false);

  const [matchType, setMatchType] = useState<MatchType>('open');
  const [fieldIndex, setFieldIndex] = useState(0);
  const [sportIndex, setSportIndex] = useState(0);
  const [formatIndex, setFormatIndex] = useState(0);

  // Date/time as strings (used for submission / validation)
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [confirmationDeadline, setConfirmationDeadline] = useState('');

  // Date/time as Date objects (used by pickers)
  const [dateObj, setDateObj] = useState<Date | null>(null);
  const [startTimeObj, setStartTimeObj] = useState<Date | null>(null);
  const [endTimeObj, setEndTimeObj] = useState<Date | null>(null);
  const [deadlineDateObj, setDeadlineDateObj] = useState<Date | null>(null);
  const [deadlineTimeObj, setDeadlineTimeObj] = useState<Date | null>(null);

  // Which picker is currently open
  const [activePicker, setActivePicker] = useState<ActivePicker>(null);

  const [pricePerPlayer, setPricePerPlayer] = useState('');
  const [minPlayers, setMinPlayers] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [totalPrice, setTotalPrice] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    async function loadData() {
      try {
        const [clubsRes, sportsRes] = await Promise.all([
          supabase.from('clubs').select('id').eq('owner_id', user!.id),
          supabase.from('sports').select('id, name, formats').eq('is_active', true),
        ]);

        if (clubsRes.error) throw clubsRes.error;
        const clubIds = (clubsRes.data ?? []).map((c: { id: string }) => c.id);

        const fieldsRes = clubIds.length > 0
          ? await supabase
              .from('fields')
              .select('id, name, clubs(name)')
              .in('club_id', clubIds)
          : { data: [], error: null };

        if (fieldsRes.error) throw fieldsRes.error;
        if (sportsRes.error) throw sportsRes.error;

        const fetchedFields = (fieldsRes.data ?? []) as Field[];
        const fetchedSports = (sportsRes.data ?? []) as Sport[];

        setFields(fetchedFields);
        setSports(fetchedSports);

        if (fetchedFields.length === 0) setNoFields(true);
      } catch {
        setError('No se pudieron cargar los datos. Intenta de nuevo.');
      } finally {
        setLoadingData(false);
      }
    }
    loadData();
  }, [user]);

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
    const dateStr = dateToString(dDate);
    const timeStr = formatTimeDisplay(dTime);
    return `${dateStr} ${timeStr}`;
  }

  function handlePickerChange(picker: ActivePicker, event: DateTimePickerEvent, selected?: Date) {
    if (event.type === 'dismissed') {
      setActivePicker(null);
      return;
    }

    if (!selected) return;

    if (Platform.OS === 'android') {
      setActivePicker(null);
    }

    switch (picker) {
      case 'date': {
        setDateObj(selected);
        setDate(dateToString(selected));
        break;
      }
      case 'startTime': {
        setStartTimeObj(selected);
        setStartTime(formatTimeDisplay(selected));
        break;
      }
      case 'endTime': {
        setEndTimeObj(selected);
        setEndTime(formatTimeDisplay(selected));
        break;
      }
      case 'deadlineDate': {
        setDeadlineDateObj(selected);
        setConfirmationDeadline(buildDeadlineString(selected, deadlineTimeObj));
        break;
      }
      case 'deadlineTime': {
        setDeadlineTimeObj(selected);
        setConfirmationDeadline(buildDeadlineString(deadlineDateObj, selected));
        break;
      }
    }
  }

  function validate(): string | null {
    if (fields.length === 0) return 'No tienes canchas registradas.';
    if (!date) return 'La fecha es obligatoria.';
    if (!isFutureDate(date)) return 'La fecha debe ser en el futuro.';
    if (!startTime) return 'La hora de inicio es obligatoria.';
    if (!endTime) return 'La hora de fin es obligatoria.';
    if (startTime >= endTime) return 'La hora de fin debe ser posterior a la de inicio.';
    if (!selectedSport) return 'Selecciona un deporte.';
    if (availableFormats.length > 0 && !availableFormats[formatIndex]) return 'Selecciona un formato.';

    if (matchType === 'open') {
      if (!pricePerPlayer) return 'El precio por jugador es obligatorio.';
      if (isNaN(Number(pricePerPlayer)) || Number(pricePerPlayer) < 0) return 'Precio por jugador inválido.';
      if (!minPlayers) return 'Los jugadores mínimos son obligatorios.';
      if (!maxPlayers) return 'Los jugadores máximos son obligatorios.';
      const min = parseInt(minPlayers, 10);
      const max = parseInt(maxPlayers, 10);
      if (isNaN(min) || min < 1) return 'Jugadores mínimos inválidos.';
      if (isNaN(max) || max < 1) return 'Jugadores máximos inválidos.';
      if (min > max) return 'Los jugadores mínimos no pueden superar los máximos.';
      if (!confirmationDeadline) return 'El plazo de confirmación es obligatorio.';
      if (!deadlineBeforeMatch(confirmationDeadline, date)) return 'El plazo debe ser antes del partido.';
    }

    if (matchType === 'reservation') {
      if (!totalPrice) return 'El precio total es obligatorio.';
      if (isNaN(Number(totalPrice)) || Number(totalPrice) < 0) return 'Precio total inválido.';
    }

    return null;
  }

  async function handleSubmit() {
    setError(null);
    const validationError = validate();
    if (validationError) { setError(validationError); return; }

    setSubmitting(true);
    try {
      const selectedField = fields[fieldIndex];
      const format = availableFormats.length > 0 ? availableFormats[formatIndex] : null;

      const matchData: Record<string, unknown> = {
        field_id: selectedField.id,
        sport_id: selectedSport!.id,
        format,
        type: matchType,
        date,
        start_time: startTime,
        end_time: endTime,
        status: 'open',
        is_visible: true,
      };

      if (matchType === 'open') {
        matchData.price_per_player = Number(pricePerPlayer);
        matchData.min_players = parseInt(minPlayers, 10);
        matchData.max_players = parseInt(maxPlayers, 10);
        matchData.confirmation_deadline = confirmationDeadline.replace(' ', 'T');
      } else {
        matchData.total_price = Number(totalPrice);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertError } = await supabase.from('matches').insert(matchData as any);
      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => router.replace('/(owner)/'), 1500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al publicar el partido.';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  if (loadingData) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (noFields) {
    return (
      <View style={styles.centered}>
        <Text style={styles.noFieldsTitle}>Sin canchas registradas</Text>
        <Text style={styles.noFieldsText}>
          Primero debes agregar una cancha antes de publicar un partido.
        </Text>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Volver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (success) {
    return (
      <View style={styles.centered}>
        <View style={styles.successCircle}>
          <Text style={styles.successCheck}>✓</Text>
        </View>
        <Text style={styles.successTitle}>¡Partido publicado!</Text>
        <Text style={styles.successText}>Redirigiendo al panel…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backArrow}>
            <Text style={styles.backArrowText}>← Volver</Text>
          </TouchableOpacity>
          <Text style={styles.title}>Publicar partido</Text>
        </View>

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {/* Match type toggle */}
        <View style={styles.section}>
          <Text style={styles.label}>Tipo de partido</Text>
          <View style={styles.segmented}>
            <TouchableOpacity
              style={[styles.segment, styles.segmentLeft, matchType === 'open' && styles.segmentActive]}
              onPress={() => setMatchType('open')}
            >
              <Text style={[styles.segmentText, matchType === 'open' && styles.segmentTextActive]}>
                Abierto
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.segment, styles.segmentRight, matchType === 'reservation' && styles.segmentActive]}
              onPress={() => setMatchType('reservation')}
            >
              <Text style={[styles.segmentText, matchType === 'reservation' && styles.segmentTextActive]}>
                Reserva
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Field picker */}
        <View style={styles.section}>
          <Text style={styles.label}>Cancha</Text>
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
        </View>

        {/* Sport picker */}
        <View style={styles.section}>
          <Text style={styles.label}>Deporte</Text>
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
        </View>

        {/* Format picker */}
        {availableFormats.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Formato</Text>
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
          </View>
        )}

        {/* Date */}
        <View style={styles.section}>
          <Text style={styles.label}>Fecha</Text>
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
        </View>

        {/* Start / end time */}
        <View style={styles.row2}>
          <View style={[styles.section, styles.rowHalf]}>
            <Text style={styles.label}>Inicio</Text>
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
          </View>
          <View style={[styles.section, styles.rowHalf]}>
            <Text style={styles.label}>Fin</Text>
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
          </View>
        </View>

        {/* Open match fields */}
        {matchType === 'open' && (
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

        {/* Reservation field */}
        {matchType === 'reservation' && (
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
          style={[styles.submitButton, submitting && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={submitting}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={colors.accentFg} />
          ) : (
            <Text style={styles.submitButtonText}>Publicar partido</Text>
          )}
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bg,
  },
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
  header: {
    marginBottom: spacing.xl,
  },
  backArrow: {
    marginBottom: spacing.md,
  },
  backArrowText: {
    fontSize: 15,
    color: colors.accent,
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.5,
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
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginBottom: spacing.lg,
  },
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
  inputValueText: {
    fontSize: 15,
    color: colors.text,
  },
  inputPlaceholderText: {
    fontSize: 15,
    color: colors.dim,
  },
  hint: {
    fontSize: 11,
    color: colors.dim,
    marginTop: 5,
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: 13,
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  segmentLeft: {
    borderRightWidth: 0.5,
    borderRightColor: colors.line,
  },
  segmentRight: {
    borderLeftWidth: 0.5,
    borderLeftColor: colors.line,
  },
  segmentActive: {
    backgroundColor: colors.accent,
  },
  segmentText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mute,
  },
  segmentTextActive: {
    color: colors.accentFg,
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  pickerArrow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
  },
  pickerArrowText: {
    fontSize: 22,
    color: colors.accent,
    fontWeight: '700',
  },
  arrowDisabled: {
    color: colors.line2,
  },
  pickerValue: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  pickerValueText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.text,
  },
  pickerValueSub: {
    fontSize: 12,
    color: colors.mute,
    marginTop: 2,
  },
  prefixInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
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
  prefixText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.mute,
  },
  inputWithPrefix: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  row2: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowHalf: {
    flex: 1,
  },
  submitButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: colors.accentFg,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  noFieldsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  noFieldsText: {
    fontSize: 15,
    color: colors.mute,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  backButtonText: {
    color: colors.accentFg,
    fontWeight: '700',
    fontSize: 15,
  },
  successCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  successCheck: {
    fontSize: 36,
    color: colors.accentFg,
    fontWeight: '700',
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  successText: {
    fontSize: 14,
    color: colors.mute,
    textAlign: 'center',
  },
});
