import { Stack } from 'expo-router';

export default function MatchLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: '#f8f9fa' },
        headerTintColor: '#0f172a',
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerBackTitle: 'Atrás',
        contentStyle: { backgroundColor: '#f8f9fa' },
      }}
    />
  );
}
