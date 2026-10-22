import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { RoomConfiguration, TrackSource } from '@livekit/protocol';
import { createClient } from '@supabase/supabase-js';
import { AccessToken } from 'livekit-server-sdk';

import { requiredEnv, supabasePublishableKey } from '../_shared/env.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
};

type AuthorizationRow = {
  call_id: string;
  room_name: string;
  participant_name: string;
  avatar_path: string | null;
  max_participants: number;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization?.startsWith('Bearer ')) return Response.json({ error: 'Authentication required' }, { status: 401, headers: corsHeaders });

    const body = await request.json() as { channel_id?: unknown };
    const channelId = typeof body.channel_id === 'string' ? body.channel_id : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(channelId)) {
      return Response.json({ error: 'A valid voice channel is required' }, { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(requiredEnv('SUPABASE_URL'), supabasePublishableKey(), {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return Response.json({ error: 'Invalid session' }, { status: 401, headers: corsHeaders });

    const { data, error } = await supabase.rpc('authorize_livekit_voice_join', { requested_channel_id: channelId });
    if (error) return Response.json({ error: error.message }, { status: 403, headers: corsHeaders });
    const allowed = (data?.[0] ?? null) as AuthorizationRow | null;
    if (!allowed) return Response.json({ error: 'Voice access was not granted' }, { status: 403, headers: corsHeaders });

    const token = new AccessToken(requiredEnv('LIVEKIT_API_KEY'), requiredEnv('LIVEKIT_API_SECRET'), {
      identity: userData.user.id,
      name: allowed.participant_name,
      metadata: JSON.stringify({ profile_id: userData.user.id, avatar_path: allowed.avatar_path }),
      ttl: '10m',
    });
    token.addGrant({
      roomJoin: true,
      room: allowed.room_name,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
      canPublishSources: [TrackSource.MICROPHONE],
    });
    token.roomConfig = new RoomConfiguration({
      maxParticipants: allowed.max_participants,
      emptyTimeout: 300,
      departureTimeout: 20,
    });

    return Response.json({
      server_url: requiredEnv('LIVEKIT_URL'),
      participant_token: await token.toJwt(),
      call_id: allowed.call_id,
    }, { status: 201, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('LiveKit token error', error);
    return Response.json({ error: error instanceof Error ? error.message : 'Could not issue a voice token' }, { status: 500, headers: corsHeaders });
  }
});
