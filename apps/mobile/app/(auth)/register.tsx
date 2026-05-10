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

      const { error: insertError } = await supabase.from('users').insert({
        id: authData.user.id,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || null,
        role,
      });

      if (insertError) {
        setError('No se pudo guardar tu perfil. Intenta de nuevo.');
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
          <Text style={styles.title}>Crear cuenta</Text>
          <Text style={styles.subtitle}>Únete a AppDeportes</Text>
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
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Juan Pérez"
              autoCapitalize="words"
              autoCorrect={false}
              autoComplete="name"
              editable={!loading}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Correo electrónico</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
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
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
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
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+593 99 999 9999"
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
              <ActivityIndicator color="#ffffff" />
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
    backgroundColor: '#f8f9fa',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  header: {
    marginBottom: 40,
    alignItems: 'center',
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#0f172a',
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    fontWeight: '400',
  },
  form: {
    gap: 16,
  },
  errorBox: {
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    color: '#dc2626',
    fontSize: 14,
    fontWeight: '500',
  },
  field: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  optional: {
    fontWeight: '400',
    color: '#9ca3af',
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
  roleList: {
    gap: 10,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  roleOptionSelected: {
    borderColor: '#16a34a',
    backgroundColor: '#f0fdf4',
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d1d5db',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  radioCircleSelected: {
    borderColor: '#16a34a',
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#16a34a',
  },
  roleTextContainer: {
    flex: 1,
  },
  roleLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  roleLabelSelected: {
    color: '#15803d',
  },
  roleDescription: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 2,
  },
  button: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 16,
  },
  footerText: {
    fontSize: 14,
    color: '#64748b',
  },
  link: {
    fontSize: 14,
    color: '#16a34a',
    fontWeight: '600',
  },
});
