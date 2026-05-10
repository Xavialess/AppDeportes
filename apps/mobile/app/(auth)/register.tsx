import { useState } from 'react';
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
import { router, Link } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { colors, radius, spacing } from '../../lib/theme';

type UserRole = 'player' | 'owner';

interface RoleOption {
  label: string;
  value: UserRole;
  description: string;
}

const ROLE_OPTIONS: RoleOption[] = [
  { label: 'Jugador', value: 'player', description: 'Quiero unirme a partidos' },
  { label: 'Propietario de cancha', value: 'owner', description: 'Quiero publicar canchas' },
  { label: 'Ambos', value: 'owner', description: 'Juego y tengo canchas' },
];

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default function RegisterScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [selectedRoleIndex, setSelectedRoleIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!name.trim()) return 'Por favor ingresa tu nombre completo.';
    if (!email.trim()) return 'Por favor ingresa tu correo electrónico.';
    if (!isValidEmail(email.trim())) return 'El correo electrónico no es válido.';
    if (!password) return 'Por favor ingresa una contraseña.';
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (selectedRoleIndex === null) return 'Por favor selecciona tu rol.';
    return null;
  }

  async function handleRegister() {
    setError(null);

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    const roleOption = ROLE_OPTIONS[selectedRoleIndex!];
    const role: UserRole = roleOption.value;

    setLoading(true);

    try {
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            name: name.trim(),
            phone: phone.trim() || undefined,
            role,
          },
        },
      });

      if (signUpError) {
        if (signUpError.message.toLowerCase().includes('already registered')) {
          setError('Ya existe una cuenta con ese correo electrónico.');
        } else {
          setError('No se pudo crear la cuenta. Intenta de nuevo.');
        }
        return;
      }

      if (!authData.user) {
        setError('No se pudo crear la cuenta. Intenta de nuevo.');
        return;
      }

      if (role === 'player') {
        router.replace('/(tabs)/');
      } else {
        router.replace('/(owner)/');
      }
    } catch {
      setError('Ocurrió un error inesperado. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
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
        <View style={styles.header}>
          <Text style={styles.brand}>
            cancha<Text style={styles.brandDot}>.</Text>
          </Text>
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Únete a la comunidad deportiva</Text>
        </View>

        <View style={styles.form}>
          {error ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.field}>
            <Text style={styles.label}>Nombre completo</Text>
            <TextInput
              style={[styles.input, loading && styles.inputDisabled]}
              value={name}
              onChangeText={setName}
              placeholder="Juan Pérez"
              placeholderTextColor={colors.dim}
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="name"
              editable={!loading}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              style={[styles.input, loading && styles.inputDisabled]}
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              placeholderTextColor={colors.dim}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              editable={!loading}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              style={[styles.input, loading && styles.inputDisabled]}
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
              placeholderTextColor={colors.dim}
              secureTextEntry
              autoComplete="new-password"
              editable={!loading}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>
              Teléfono{' '}
              <Text style={styles.optional}>(opcional)</Text>
            </Text>
            <TextInput
              style={[styles.input, loading && styles.inputDisabled]}
              value={phone}
              onChangeText={setPhone}
              placeholder="+593 99 999 9999"
              placeholderTextColor={colors.dim}
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={!loading}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>¿Cuál es tu rol?</Text>
            <View style={styles.roleList}>
              {ROLE_OPTIONS.map((option, index) => {
                const selected = selectedRoleIndex === index;
                return (
                  <TouchableOpacity
                    key={index}
                    style={[styles.roleOption, selected && styles.roleOptionSelected]}
                    onPress={() => setSelectedRoleIndex(index)}
                    disabled={loading}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.radioCircle, selected && styles.radioCircleSelected]}>
                      {selected ? <View style={styles.radioDot} /> : null}
                    </View>
                    <View style={styles.roleTextContainer}>
                      <Text style={[styles.roleLabel, selected && styles.roleLabelSelected]}>
                        {option.label}
                      </Text>
                      <Text style={styles.roleDescription}>{option.description}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleRegister}
            disabled={loading}
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color={colors.accentFg} />
            ) : (
              <Text style={styles.buttonText}>Crear cuenta</Text>
            )}
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>¿Ya tienes cuenta?{' '}</Text>
            <Link href="/(auth)/login" asChild>
              <TouchableOpacity disabled={loading}>
                <Text style={styles.link}>Inicia sesión</Text>
              </TouchableOpacity>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: 48,
  },
  header: {
    marginBottom: 36,
    alignItems: 'center',
  },
  brand: {
    fontSize: 30,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.6,
    marginBottom: spacing.sm,
  },
  brandDot: {
    color: colors.accent,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: colors.mute,
  },
  form: {
    gap: spacing.lg,
  },
  errorBox: {
    backgroundColor: colors.errorBg,
    borderWidth: 1,
    borderColor: colors.errorBorder,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorText: {
    color: colors.error,
    fontSize: 14,
    fontWeight: '500',
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.mute,
    letterSpacing: 0.1,
  },
  optional: {
    fontWeight: '400',
    color: colors.dim,
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
  },
  inputDisabled: {
    opacity: 0.5,
  },
  roleList: {
    gap: 10,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    gap: spacing.md,
  },
  roleOptionSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(212,255,58,0.05)',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioCircleSelected: {
    borderColor: colors.accent,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  roleTextContainer: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.mute,
  },
  roleLabelSelected: {
    color: colors.text,
  },
  roleDescription: {
    fontSize: 13,
    color: colors.dim,
    marginTop: 2,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: radius.card,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: colors.accentFg,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: spacing.md,
  },
  footerText: {
    fontSize: 14,
    color: colors.mute,
  },
  link: {
    fontSize: 14,
    color: colors.accent,
    fontWeight: '600',
  },
});
