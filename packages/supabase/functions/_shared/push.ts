/*
 * Shared push-notification helpers for Edge Functions.
 *
 * Wraps the Expo Push API (https://docs.expo.dev/push-notifications/sending-notifications/).
 * cancha. sends through Expo rather than talking to APNs/FCM directly — Expo
 * fans a single message out to both platforms from one token.
 *
 * Two pieces:
 *   - getTokensForUsers: resolve a set of user IDs to their device push tokens
 *   - sendExpoPush:      POST a batch of messages to Expo, chunked to 100/req
 *
 * Both are pure transport helpers — the caller decides who gets notified and
 * what the copy says.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Permissive client type so these helpers accept a service-role client created
// in any Edge Function regardless of how its Database generic is inferred.
// deno-lint-ignore no-explicit-any
export type AnySupabaseClient = SupabaseClient<any, any, any>;

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

// Expo rejects batches larger than 100 messages.
const EXPO_MAX_BATCH = 100;

export interface PushMessage {
  to: string;
  title: string;
  body: string;
  // Arbitrary payload delivered to the app; used for tap-to-navigate routing.
  data?: Record<string, unknown>;
  sound?: 'default';
}

/**
 * Resolve user IDs to their registered Expo push tokens.
 *
 * Returns a flat list of tokens — a single user may have several (one per
 * device they are signed in on). Deduplicates defensively in case the same
 * token somehow appears twice.
 */
export async function getTokensForUsers(
  supabase: AnySupabaseClient,
  userIds: string[],
): Promise<string[]> {
  if (userIds.length === 0) return [];

  const { data, error } = await supabase
    .from('push_tokens')
    .select('token')
    .in('user_id', userIds);

  if (error) {
    throw new Error(`push token lookup: ${error.message}`);
  }

  const tokens = ((data ?? []) as { token: string }[]).map((r) => r.token);
  return [...new Set(tokens)];
}

/**
 * Send a batch of push messages through Expo.
 *
 * Chunks into groups of 100 (Expo's per-request ceiling) and sends them
 * sequentially. Returns the number of messages accepted by Expo. Never throws
 * on a partial failure — a single bad token must not abort a whole match's
 * notifications — but logs each non-ok chunk for diagnosis.
 */
export async function sendExpoPush(messages: PushMessage[]): Promise<number> {
  if (messages.length === 0) return 0;

  let sent = 0;

  for (let i = 0; i < messages.length; i += EXPO_MAX_BATCH) {
    const chunk = messages.slice(i, i + EXPO_MAX_BATCH);

    try {
      const res = await fetch(EXPO_PUSH_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        const text = await res.text();
        console.error(JSON.stringify({
          event: 'expo_push_error',
          status: res.status,
          body: text.slice(0, 500),
        }));
        continue;
      }

      sent += chunk.length;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(JSON.stringify({ event: 'expo_push_exception', error: message }));
    }
  }

  return sent;
}

/**
 * Convenience: build identical-copy messages for a list of tokens.
 */
export function buildMessages(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>,
): PushMessage[] {
  return tokens.map((to) => ({ to, title, body, data, sound: 'default' }));
}
