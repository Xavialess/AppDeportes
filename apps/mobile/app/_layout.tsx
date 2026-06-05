import { useEffect, useRef } from 'react';
import { Stack, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { I18nextProvider } from 'react-i18next';
import i18n from '@appdeportes/i18n';
import { useSession } from '../hooks/useSession';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { supabase } from '../lib/supabase';

// Keep the native splash up until index.tsx mounts and dismisses it
SplashScreen.preventAutoHideAsync().catch(() => {});

type UserRole = 'player' | 'owner' | 'admin';

function SessionGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSession();
  const hasRouted = useRef(false);
  const segments = useSegments();

  // Register this device for push and route notification taps to the match.
  usePushNotifications(session?.user.id ?? null);

  // index.tsx (root "/") owns its own splash + routing — skip here
  const isOnSplash = (segments as string[]).length === 0;

  useEffect(() => {
    if (loading || isOnSplash) return;

    if (!session) {
      hasRouted.current = false;
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
          router.replace('/(auth)/login');
          return;
        }

        hasRouted.current = true;
        const role = data.role as UserRole;
        if (role === 'player') {
          router.replace('/(tabs)/');
        } else {
          router.replace('/(owner)/');
        }
      });
  }, [session, loading, isOnSplash]);

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

