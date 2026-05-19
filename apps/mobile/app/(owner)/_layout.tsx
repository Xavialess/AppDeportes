import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors } from '../../lib/theme';

type IoniconsName = React.ComponentProps<typeof Ionicons>['name'];

function tabIcon(focused: boolean, name: IoniconsName, outlineName: IoniconsName) {
  return <Ionicons name={focused ? name : outlineName} size={22} color={focused ? colors.accent : colors.dim} />;
}

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
      <Tabs.Screen
        name="index"
        options={{
          title: 'Partidos',
          tabBarIcon: ({ focused }) => tabIcon(focused, 'grid', 'grid-outline'),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ focused }) => tabIcon(focused, 'person', 'person-outline'),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen
        name="fields"
        options={{
          title: 'Canchas',
          tabBarIcon: ({ focused }) => tabIcon(focused, 'location', 'location-outline'),
        }}
        listeners={{ tabPress: () => Haptics.selectionAsync() }}
      />
      <Tabs.Screen name="post-match" options={hiddenScreen} />
      <Tabs.Screen name="match" options={hiddenScreen} />
      <Tabs.Screen name="my-match" options={hiddenScreen} />
      <Tabs.Screen name="my-field" options={hiddenScreen} />
    </Tabs>
  );
}
