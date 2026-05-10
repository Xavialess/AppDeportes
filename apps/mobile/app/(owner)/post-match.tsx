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
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { useSession } from '../../hooks/useSession';

type MatchType = 'open' | 'reservation';

interface Field {
  id: string;
  name: string;
  address: string;
}

interface Sport {
  id: string;
  name: string;
  formats: string[];
}

function isValidDate(str: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const d = new Date(str);
  return !isNaN(d.getTime());
}

function isValidTime(str: string): boolean {
  return /^\d{2}:\d{2}$/.test(str);
}

function isValidDateTime(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(str);
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

  // Form state
  const [matchType, setMatchType] = useState<MatchType>('open');
  const [fieldIndex, setFieldIndex] = useState(0);
  const [sportIndex, setSportIndex] = useState(0);
  const [formatIndex, setFormatIndex] = useState(0);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  // Open match extra fields
  const [pricePerPlayer, setPricePerPlayer] = useState('');
  const [minPlayers, setMinPlayers] = useState('');
  const [maxPlayers, setMaxPlayers] = useState('');
  const [confirmationDeadline, setConfirmationDeadline] = useState('');

  // Reservation extra field
  const [totalPrice, setTotalPrice] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!user) return;
    async function loadData() {
      try {
        const [fieldsRes, sportsRes] = await Promise.all([
          supabase.from('fields').select('id, name, address').eq('owner_id', user!.id),
          supabase.from('sports').select('id, name, formats').eq('is_active', true),
        ]);

        if (fieldsRes.error) throw fieldsRes.error;
        if (sportsRes.error) throw sportsRes.error;

        const fetchedFields = (fieldsRes.data ?? []) as Field[];
        const fetchedSports = (sportsRes.data ?? []) as Sport[];

        setFields(fetchedFields);
        setSports(fetchedSports);

        if (fetchedFields.length === 0) {
          setNoFields(true);
        }
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

  function validate(): string | null {
    if (fields.length === 0) return 'No tienes canchas registradas.';
    if (!date) return 'La fecha es obligatoria.';
    if (!isValidDate(date)) return 'Fecha inválida. Usa el formato AAAA-MM-DD.';
    if (!isFutureDate(date)) return 'La fecha debe ser en el futuro.';
    if (!startTime) return 'La hora de inicio es obligatoria.';
    if (!isValidTime(startTime)) return 'Hora de inicio inválida. Usa HH:MM.';
    if (!endTime) return 'La hora de fin es obligatoria.';
    if (!isValidTime(endTime)) return 'Hora de fin inválida. Usa HH:MM.';
    if (startTime >= endTime) return 'La hora de fin debe ser posterior a la de inicio.';
    if (!selectedSport) return 'Selecciona un deporte.';
    if (availableFormats.length > 0 && !availableFormats[formatIndex]) {
      return 'Selecciona un formato.';
    }

    if (matchType === 'open') {
      if (!pricePerPlayer) return 'El precio por jugador es obligatorio.';
      if (isNaN(Number(pricePerPlayer)) || Number(pricePerPlayer) < 0)
        return 'Precio por jugador inválido.';
      if (!minPlayers) return 'Los jugadores mínimos son obligatorios.';
      if (!maxPlayers) return 'Los jugadores máximos son obligatorios.';
      const min = parseInt(minPlayers, 10);
      const max = parseInt(maxPlayers, 10);
      if (isNaN(min) || min < 1) return 'Jugadores mínimos inválidos.';
      if (isNaN(max) || max < 1) return 'Jugadores máximos inválidos.';
      if (min > max) return 'Los jugadores mínimos no pueden superar los máximos.';
      if (!confirmationDeadline) return 'El plazo de confirmación es obligatorio.';
      if (!isValidDateTime(confirmationDeadline))
        return 'Plazo de confirmación inválido. Usa AAAA-MM-DD HH:MM.';
      if (!deadlineBeforeMatch(confirmationDeadline, date))
        return 'El plazo de confirmación debe ser antes de la fecha del partido.';
    }

    if (matchType === 'reservation') {
      if (!totalPrice) return 'El precio total es obligatorio.';
      if (isNaN(Number(totalPrice)) || Number(totalPrice) < 0)
        return 'Precio total inválido.';
    }

    return null;
  }

  async function handleSubmit() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const selectedField = fields[fieldIndex];
      const format =
        availableFormats.length > 0 ? availableFormats[formatIndex] : null;

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

      const { error: insertError } = await supabase.from('matches').insert(matchData);

      if (insertError) throw insertError;

      setSuccess(true);
      setTimeout(() => {
        router.replace('/(owner)/');
      }, 1500);
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
        <ActivityIndicator size="large" color="#16a34a" />
      </View>
    );
  }

  if (noFields) {
    return (
      <View style={styles.centered}>
        <Text style={styles.noFieldsIcon}>🏟️</Text>
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
        <Text style={styles.successIcon}>✓</Text>
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
      >
        {/* Header */}
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

        {/* Tipo de partido */}
        <View style={styles.section}>
          <Text style={styles.label}>Tipo de partido</Text>
          <View style={styles.segmented}>
            <TouchableOpacity
              style={[
                styles.segment,
                styles.segmentLeft,
                matchType === 'open' && styles.segmentActive,
              ]}
              onPress={() => setMatchType('open')}
            >
              <Text
                style={[
                  styles.segmentText,
                  matchType === 'open' && styles.segmentTextActive,
                ]}
              >
                Abierto
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segment,
                styles.segmentRight,
                matchType === 'reservation' && styles.segmentActive,
              ]}
              onPress={() => setMatchType('reservation')}
            >
              <Text
                style={[
                  styles.segmentText,
                  matchType === 'reservation' && styles.segmentTextActive,
                ]}
              >
                Reserva
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cancha */}
        <View style={styles.section}>
          <Text style={styles.label}>Cancha</Text>
          <View style={styles.pickerRow}>
            <TouchableOpacity
              style={styles.pickerArrow}
              onPress={() => setFieldIndex((i) => Math.max(i - 1, 0))}
              disabled={fieldIndex === 0}
            >
              <Text style={[styles.pickerArrowText, fieldIndex === 0 && styles.arrowDisabled]}>
                ‹
              </Text>
            </TouchableOpacity>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText} numberOfLines={1}>
                {fields[fieldIndex]?.name ?? '—'}
              </Text>
              <Text style={styles.pickerValueSub} numberOfLines={1}>
                {fields[fieldIndex]?.address ?? ''}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.pickerArrow}
              onPress={() => setFieldIndex((i) => Math.min(i + 1, fields.length - 1))}
              disabled={fieldIndex === fields.length - 1}
            >
              <Text
                style={[
                  styles.pickerArrowText,
                  fieldIndex === fields.length - 1 && styles.arrowDisabled,
                ]}
              >
                ›
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Deporte */}
        <View style={styles.section}>
          <Text style={styles.label}>Deporte</Text>
          <View style={styles.pickerRow}>
            <TouchableOpacity
              style={styles.pickerArrow}
              onPress={() => handleSportChange('prev')}
              disabled={sportIndex === 0}
            >
              <Text style={[styles.pickerArrowText, sportIndex === 0 && styles.arrowDisabled]}>
                ‹
              </Text>
            </TouchableOpacity>
            <View style={styles.pickerValue}>
              <Text style={styles.pickerValueText}>
                {selectedSport?.name ?? '—'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.pickerArrow}
              onPress={() => handleSportChange('next')}
              disabled={sportIndex === sports.length - 1}
            >
              <Text
                style={[
                  styles.pickerArrowText,
                  sportIndex === sports.length - 1 && styles.arrowDisabled,
                ]}
              >
                ›
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Formato */}
        {availableFormats.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.label}>Formato</Text>
            <View style={styles.pickerRow}>
              <TouchableOpacity
                style={styles.pickerArrow}
                onPress={() => setFormatIndex((i) => Math.max(i - 1, 0))}
                disabled={formatIndex === 0}
              >
                <Text
                  style={[styles.pickerArrowText, formatIndex === 0 && styles.arrowDisabled]}
                >
                  ‹
                </Text>
              </TouchableOpacity>
              <View style={styles.pickerValue}>
                <Text style={styles.pickerValueText}>
                  {availableFormats[formatIndex] ?? '—'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.pickerArrow}
                onPress={() =>
                  setFormatIndex((i) => Math.min(i + 1, availableFormats.length - 1))
                }
                disabled={formatIndex === availableFormats.length - 1}
              >
                <Text
                  style={[
                    styles.pickerArrowText,
                    formatIndex === availableFormats.length - 1 && styles.arrowDisabled,
                  ]}
                >
                  ›
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Fecha */}
        <View style={styles.section}>
          <Text style={styles.label}>Fecha</Text>
          <TextInput
            style={styles.input}
            value={date}
            onChangeText={setDate}
            placeholder="AAAA-MM-DD"
            keyboardType="numbers-and-punctuation"
            editable={!submitting}
            maxLength={10}
          />
        </View>

        {/* Hora de inicio */}
        <View style={styles.section}>
          <Text style={styles.label}>Hora de inicio</Text>
          <TextInput
            style={styles.input}
            value={startTime}
            onChangeText={setStartTime}
            placeholder="HH:MM"
            keyboardType="numbers-and-punctuation"
            editable={!submitting}
            maxLength={5}
          />
        </View>

        {/* Hora de fin */}
        <View style={styles.section}>
          <Text style={styles.label}>Hora de fin</Text>
          <TextInput
            style={styles.input}
            value={endTime}
            onChangeText={setEndTime}
            placeholder="HH:MM"
            keyboardType="numbers-and-punctuation"
            editable={!submitting}
            maxLength={5}
          />
        </View>

        {/* Open match extra fields */}
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
                  keyboardType="number-pad"
                  editable={!submitting}
                  maxLength={3}
                />
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.label}>Plazo de confirmación</Text>
              <TextInput
                style={styles.input}
                value={confirmationDeadline}
                onChangeText={setConfirmationDeadline}
                placeholder="AAAA-MM-DD HH:MM"
                keyboardType="numbers-and-punctuation"
                editable={!submitting}
                maxLength={16}
              />
              <Text style={styles.hint}>Debe ser antes de la fecha del partido</Text>
            </View>
          </>
        )}

        {/* Reservation extra field */}
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
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.submitButtonText}>Publicar partido</Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 32,
  },
  container: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  backArrow: {
    marginBottom: 12,
  },
  backArrowText: {
    fontSize: 15,
    color: '#16a34a',
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
  },
  section: {
    marginBottom: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0f172a',
  },
  hint: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  segmented: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  segmentLeft: {
    borderRightWidth: 0.5,
    borderRightColor: '#d1d5db',
  },
  segmentRight: {
    borderLeftWidth: 0.5,
    borderLeftColor: '#d1d5db',
  },
  segmentActive: {
    backgroundColor: '#16a34a',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#64748b',
  },
  segmentTextActive: {
    color: '#ffffff',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    overflow: 'hidden',
  },
  pickerArrow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  pickerArrowText: {
    fontSize: 22,
    color: '#16a34a',
    fontWeight: '700',
  },
  arrowDisabled: {
    color: '#d1d5db',
  },
  pickerValue: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
  },
  pickerValueText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0f172a',
  },
  pickerValueSub: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 2,
  },
  prefixInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  prefix: {
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRightWidth: 0,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  prefixText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#374151',
  },
  inputWithPrefix: {
    flex: 1,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  row2: {
    flexDirection: 'row',
    gap: 12,
  },
  rowHalf: {
    flex: 1,
  },
  submitButton: {
    backgroundColor: '#16a34a',
    borderRadius: 12,
    paddingVertical: 17,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#16a34a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  bottomSpacer: {
    height: 24,
  },
  noFieldsIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  noFieldsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  noFieldsText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 32,
  },
  backButton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 32,
  },
  backButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 15,
  },
  successIcon: {
    fontSize: 56,
    color: '#16a34a',
    marginBottom: 16,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  successText: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
  },
});
