import { useEffect, useRef } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { I18nextProvider } from 'react-i18next';
import i18n from '@appdeportes/i18n';
import { useSession } from '../hooks/useSession';
import { supabase } from '../lib/supabase';

SplashScreen.preventAutoHideAsync().catch(() => {});

function hideSplash() {
  SplashScreen.hideAsync().catch(() => {});
}

type UserRole = 'player' | 'owner' | 'admin';

function SessionGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const hasRouted = useRef(false);

  useEffect(() => {
    if (loading) return;

    if (!session) {
      hasRouted.current = false;
      hideSplash();
      router.replace('/(auth)/login');
      return;
    }

    if (hasRouted.current) return;

    supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (!data) {
          hideSplash();
          router.replace('/(auth)/login');
          return;
        }

        hasRouted.current = true;
        const role = data.role as UserRole;
        hideSplash();
        if (role === 'player') {
          router.replace('/(tabs)/');
        } else {
          router.replace('/(owner)/');
        }
      });
  }, [session, loading]);

  if (loading) {
    return (
      <View style={styles.splash}>
        <ActivityIndicator size="large" color="#d4ff3a" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <I18nextProvider i18n={i18n}>
      <StatusBar style="light" />
      <SessionGate>
        <Stack
          screenOptions={{
            headerShown: false,
            animation: 'slide_from_right',
            animationDuration: 220,
          }}
        />
      </SessionGate>
    </I18nextProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
  },
});
