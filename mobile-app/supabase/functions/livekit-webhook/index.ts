import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { TrackSource } from '@livekit/protocol';
import { createClient } from '@supabase/supabase-js';
import { WebhookReceiver } from 'livekit-server-sdk';

import { requiredEnv, supabaseSecretKey } from '../_shared/env.ts';

const receiver = new WebhookReceiver(requiredEnv('LIVEKIT_API_KEY'), requiredEnv('LIVEKIT_API_SECRET'));

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  try {
    const rawBody = await request.text();
    const event = await receiver.receive(rawBody, request.headers.get('Authorization') ?? '');
    const roomName = event.room?.name;
    if (!roomName) return new Response('ok');

    let lifecycleEvent: string | null = null;
    let microphoneMuted: boolean | null = null;
    if (event.event === 'participant_joined') lifecycleEvent = 'participant_joined';
    if (event.event === 'participant_left') lifecycleEvent = 'participant_left';
    if (event.event === 'room_finished') lifecycleEvent = 'room_finished';
    if ((event.event === 'track_muted' || event.event === 'track_unmuted') && event.track?.source === TrackSource.MICROPHONE) {
      lifecycleEvent = event.event === 'track_muted' ? 'microphone_muted' : 'microphone_unmuted';
      microphoneMuted = event.event === 'track_muted';
    }
    if (!lifecycleEvent) return new Response('ok');

    const identity = event.participant?.identity ?? null;
    const userId = identity && /^[0-9a-f-]{36}$/i.test(identity) ? identity : null;
    const participantSid = event.participant?.sid ?? null;
    const admin = createClient(requiredEnv('SUPABASE_URL'), supabaseSecretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin.rpc('record_livekit_participant_event_v2', {
      requested_room_name: roomName,
      requested_user_id: userId,
      requested_participant_sid: participantSid,
      requested_event: lifecycleEvent,
      requested_microphone_muted: microphoneMuted,
    });
    if (error) throw error;
    return new Response('ok');
  } catch (error) {
    console.error('LiveKit webhook error', error);
    return new Response('Invalid webhook', { status: 401 });
  }
});
