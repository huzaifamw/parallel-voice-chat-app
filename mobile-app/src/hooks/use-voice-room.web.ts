import { AudioPresets, ConnectionState, Participant, RemoteAudioTrack, Room, RoomEvent } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { Profile, toPerson } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import type { VoiceConnectionState, VoiceParticipant, VoiceRoomState } from '@/lib/voice-types';

type TokenResponse = { server_url: string; participant_token: string; call_id: string };
let activeWebRoom: Room | null = null;

function mappedState(value: ConnectionState): VoiceConnectionState {
  if (value === ConnectionState.Connected) return 'connected';
  if (value === ConnectionState.Connecting) return 'connecting';
  if (value === ConnectionState.Reconnecting || value === ConnectionState.SignalReconnecting) return 'reconnecting';
  return 'disconnected';
}

function profileFor(participant: Participant): Profile {
  let avatarPath: string | null = null;
  try {
    const metadata = participant.metadata ? JSON.parse(participant.metadata) as { avatar_path?: unknown } : null;
    avatarPath = typeof metadata?.avatar_path === 'string' ? metadata.avatar_path : null;
  } catch {
    // Untrusted metadata falls back to the existing initials avatar.
  }
  return {
    id: participant.identity,
    username: participant.identity.slice(0, 12),
    display_name: participant.name?.trim() || participant.identity.slice(0, 8),
    bio: '', avatar_path: avatarPath, status: 'online', favorite_games: [], interests: [], last_seen_at: null,
  };
}

function visibleParticipants(room: Room): VoiceParticipant[] {
  return [room.localParticipant, ...room.remoteParticipants.values()].map((participant) => ({
    person: toPerson(profileFor(participant), participant.isLocal ? 'You' : 'In voice'),
    isLocal: participant.isLocal,
    muted: !participant.isMicrophoneEnabled,
    speaking: participant.isSpeaking,
  }));
}

function readableError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : 'Could not join this voice room.';
  return /permission|denied|notallowed|microphone/i.test(message)
    ? 'Microphone access was denied. Allow it in your browser settings, then try again.'
    : message;
}

export function useVoiceRoom(roomId?: string): VoiceRoomState {
  const roomRef = useRef<Room | null>(null);
  const joinRef = useRef<Promise<void> | null>(null);
  const leavingRef = useRef(false);
  const deafenedRef = useRef(false);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connectionState, setConnectionState] = useState<VoiceConnectionState>('disconnected');
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [muted, setMutedValue] = useState(true);
  const [deafened, setDeafenedValue] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setConnectionState(mappedState(room.state));
    setParticipants(visibleParticipants(room));
    setMutedValue(!room.localParticipant.isMicrophoneEnabled);
  }, []);
  const announce = useCallback((message: string) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = setTimeout(() => setNotice(null), 3200);
  }, []);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    leavingRef.current = true;
    roomRef.current = null;
    if (activeWebRoom === room) activeWebRoom = null;
    room.removeAllListeners();
    await room.disconnect(true).catch(() => undefined);
    setParticipants([]);
    setMutedValue(true);
    setDeafenedValue(false);
    setConnectionState('disconnected');
    leavingRef.current = false;
  }, []);

  const join = useCallback(async () => {
    if (!roomId || !supabase || joinRef.current) return joinRef.current ?? Promise.resolve();
    if (roomRef.current?.state === ConnectionState.Connected || roomRef.current?.state === ConnectionState.Connecting) return;
    const operation = (async () => {
      setError(null);
      setConnectionState('connecting');
      const staleRoom = roomRef.current;
      if (staleRoom?.state === ConnectionState.Disconnected) {
        staleRoom.removeAllListeners();
        roomRef.current = null;
        if (activeWebRoom === staleRoom) activeWebRoom = null;
      }
      if (activeWebRoom && activeWebRoom !== roomRef.current) {
        await activeWebRoom.disconnect(true).catch(() => undefined);
      }
      const { data, error: tokenError } = await supabase.functions.invoke<TokenResponse>('livekit-token', { body: { channel_id: roomId } });
      if (tokenError) throw tokenError;
      if (!data?.server_url || !data.participant_token) throw new Error('The voice token service returned an incomplete response.');
      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        audioCaptureDefaults: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
        publishDefaults: { audioPreset: AudioPresets.speech, dtx: true, red: true },
      });
      roomRef.current = room;
      activeWebRoom = room;
      const update = () => refresh();
      room.on(RoomEvent.ConnectionStateChanged, update);
      room.on(RoomEvent.ActiveSpeakersChanged, update);
      room.on(RoomEvent.TrackMuted, update);
      room.on(RoomEvent.TrackUnmuted, update);
      room.on(RoomEvent.TrackPublished, update);
      room.on(RoomEvent.TrackUnpublished, update);
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track instanceof RemoteAudioTrack) track.setVolume(deafenedRef.current ? 0 : 1);
        refresh();
      });
      room.on(RoomEvent.ParticipantConnected, (participant) => { refresh(); announce(`${participant.name || 'Someone'} joined`); });
      room.on(RoomEvent.ParticipantDisconnected, (participant) => { refresh(); announce(`${participant.name || 'Someone'} left`); });
      room.on(RoomEvent.Disconnected, () => {
        refresh();
        if (!leavingRef.current) setError('The voice connection ended. Tap to reconnect.');
      });
      await room.connect(data.server_url, data.participant_token, { autoSubscribe: true, maxRetries: 3 });
      await room.localParticipant.setMicrophoneEnabled(true);
      if (!room.localParticipant.isMicrophoneEnabled) throw new Error('Microphone permission was not granted.');
      refresh();
    })().catch(async (reason) => {
      const room = roomRef.current;
      if (room) {
        room.removeAllListeners();
        await room.disconnect(true).catch(() => undefined);
        if (activeWebRoom === room) activeWebRoom = null;
        roomRef.current = null;
      }
      setParticipants([]);
      setConnectionState('disconnected');
      setError(readableError(reason));
    }).finally(() => { joinRef.current = null; });
    joinRef.current = operation;
    return operation;
  }, [announce, refresh, roomId]);

  const setMuted = useCallback(async (value: boolean) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!value);
      refresh();
    } catch (reason) { setError(readableError(reason)); }
  }, [refresh]);

  const setDeafened = useCallback(async (value: boolean) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    room.remoteParticipants.forEach((participant) => participant.setVolume(value ? 0 : 1));
    deafenedRef.current = value;
    setDeafenedValue(value);
  }, []);

  const chooseAudioOutput = useCallback(async () => {
    Alert.alert('Audio output', 'Use your browser or operating-system audio controls to select an output device.');
  }, []);

  useEffect(() => {
    void join();
    return () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
      void leave();
    };
  }, [join, leave]);

  return { connectionState, participants, muted, deafened, error, notice, join, leave, setMuted, setDeafened, chooseAudioOutput };
}
