import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { supabase } from '../lib/supabase';

/*
 * usePushNotifications
 *
 * Registers the device's Expo push token against the signed-in user and routes
 * notification taps to the relevant match. Call once, high in the tree, passing
 * the authenticated user id (or null when signed out).
 *
 * Responsibilities:
 *   1. Ask for notification permission (no-op if already decided)
 *   2. Fetch the Expo push token and UPSERT it into public.push_tokens
 *   3. Listen for notification taps and deep-link to the match
 *
 * Notification copy and the decision of who gets notified live entirely on the
 * server (Edge Functions). This hook only handles the device-side plumbing.
 */

// Show an alert + play a sound when a push arrives while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type PlatformTag = 'ios' | 'android' | 'web';

function platformTag(): PlatformTag {
  if (Platform.OS === 'ios') return 'ios';
  if (Platform.OS === 'android') return 'android';
  return 'web';
}

async function registerToken(userId: string): Promise<void> {
  // Push only works on physical devices.
  if (!Device.isDevice) return;

  // Android requires an explicit channel for notifications to surface.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'General',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (existing !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('No EAS projectId — cannot fetch Expo push token');
    return;
  }

  const tokenResponse = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenResponse.data;

  // UPSERT on the unique token: re-registering the same device is idempotent,
  // and a device that changes hands re-points to the new user.
  const { error } = await supabase
    .from('push_tokens')
    .upsert(
      {
        user_id: userId,
        token,
        platform: platformTag(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'token' },
    );

  if (error) {
    console.warn(`Failed to register push token: ${error.message}`);
  }
}

function routeFromNotification(data: Record<string, unknown> | undefined): void {
  if (!data) return;
  const matchId = typeof data.match_id === 'string' ? data.match_id : null;
  if (!matchId) return;
  router.push(`/match/${matchId}` as any);
}

export function usePushNotifications(userId: string | null): void {
  const lastRegistered = useRef<string | null>(null);

  // Register the token whenever the signed-in user changes.
  useEffect(() => {
    if (!userId || lastRegistered.current === userId) return;
    lastRegistered.current = userId;
    registerToken(userId).catch((err) => {
      console.warn('Push registration error:', err);
    });
  }, [userId]);

  // Handle taps: cold-start (app opened from a notification) and warm taps.
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        routeFromNotification(
          response.notification.request.content.data as Record<string, unknown>,
        );
      }
    });

    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromNotification(
        response.notification.request.content.data as Record<string, unknown>,
      );
    });

    return () => sub.remove();
  }, []);
}
