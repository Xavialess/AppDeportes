import { View, Text, StyleSheet } from 'react-native';
import { useSession } from '../../hooks/useSession';

export default function OwnerHomeScreen() {
  const { user } = useSession();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Panel del propietario</Text>
      {user ? (
        <Text style={styles.subtitle}>Bienvenido — próximamente</Text>
      ) : null}
      <Text style={styles.placeholder}>Panel del propietario — próximamente</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#0f172a',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 24,
    textAlign: 'center',
  },
  placeholder: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
  },
});
