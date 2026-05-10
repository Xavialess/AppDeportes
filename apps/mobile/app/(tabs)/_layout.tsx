import { Tabs } from 'expo-router';

// Player tab bar — rendered after authentication
export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="matches" options={{ title: 'Partidos' }} />
      <Tabs.Screen name="my-matches" options={{ title: 'Mis partidos' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
    </Tabs>
  );
}
