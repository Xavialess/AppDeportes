import { Tabs } from 'expo-router';
import { colors } from '../../lib/theme';

const hiddenScreen = {
  href: null as null,
  tabBarStyle: { display: 'none' as const },
};

export default function OwnerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.dim,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Partidos' }} />
      <Tabs.Screen name="profile" options={{ title: 'Perfil' }} />
      <Tabs.Screen name="post-match" options={hiddenScreen} />
      <Tabs.Screen name="match" options={hiddenScreen} />
    </Tabs>
  );
}
