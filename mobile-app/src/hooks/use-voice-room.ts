import { AndroidAudioTypePresets, AudioSession } from '@livekit/react-native';
import { AudioPresets, ConnectionState, Participant, RemoteAudioTrack, Room, RoomEvent } from 'livekit-client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AlertButton, AppState, PermissionsAndroid, Platform } from 'react-native';

import { Profile, toPerson } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import type { VoiceConnectionState, VoiceParticipant, VoiceRoomState } from '@/lib/voice-types';

type TokenResponse = {
  server_url: string;
  participant_token: string;
  call_id: string;
};

let activeRoom: Room | null = null;

function connectionState(value: ConnectionState): VoiceConnectionState {
  if (value === ConnectionState.Connected) return 'connected';
  if (value === ConnectionState.Connecting) return 'connecting';
  if (value === ConnectionState.Reconnecting || value === ConnectionState.SignalReconnecting) return 'reconnecting';
  return 'disconnected';
}

function participantProfile(participant: Participant): Profile {
  let avatarPath: string | null = null;
  try {
    const metadata = participant.metadata ? JSON.parse(participant.metadata) as { avatar_path?: unknown } : null;
    avatarPath = typeof metadata?.avatar_path === 'string' ? metadata.avatar_path : null;
  } catch {
    // Metadata is optional and untrusted; a malformed value falls back to initials.
  }
  const name = participant.name?.trim() || participant.identity.slice(0, 8);
  return {
    id: participant.identity,
    username: participant.identity.slice(0, 12),
    display_name: name,
    bio: '',
    avatar_path: avatarPath,
    status: 'online',
    favorite_games: [],
    interests: [],
    last_seen_at: null,
  };
}

function roomParticipants(room: Room): VoiceParticipant[] {
  const participants: Participant[] = [room.localParticipant, ...room.remoteParticipants.values()];
  return participants.map((participant) => ({
    person: toPerson(participantProfile(participant), participant.isLocal ? 'You' : 'In voice'),
    isLocal: participant.isLocal,
    muted: !participant.isMicrophoneEnabled,
    speaking: participant.isSpeaking,
  }));
}

function friendlyError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : 'Could not join this voice room.';
  if (/permission|denied|notallowed|microphone/i.test(message)) {
    return 'Microphone access was denied. Enable it in your device settings, then try again.';
  }
  return message;
}

export function useVoiceRoom(roomId?: string): VoiceRoomState {
  const roomRef = useRef<Room | null>(null);
  const joiningRef = useRef<Promise<void> | null>(null);
  const leavingRef = useRef(false);
  const deafenedRef = useRef(false);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setState] = useState<VoiceConnectionState>('disconnected');
  const [participants, setParticipants] = useState<VoiceParticipant[]>([]);
  const [muted, setMutedState] = useState(true);
  const [deafened, setDeafenedState] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    setState(connectionState(room.state));
    setParticipants(roomParticipants(room));
    setMutedState(!room.localParticipant.isMicrophoneEnabled);
  }, []);

  const showNotice = useCallback((message: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNotice(message);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 3200);
  }, []);

  const leave = useCallback(async () => {
    const room = roomRef.current;
    if (!room) return;
    leavingRef.current = true;
    roomRef.current = null;
    const ownsAudioSession = activeRoom === room;
    if (ownsAudioSession) activeRoom = null;
    room.removeAllListeners();
    try {
      await room.disconnect(true);
    } finally {
      if (ownsAudioSession) await AudioSession.stopAudioSession().catch(() => undefined);
      setParticipants([]);
      setMutedState(true);
      setDeafenedState(false);
      deafenedRef.current = false;
      setState('disconnected');
      leavingRef.current = false;
    }
  }, []);

  const join = useCallback(async () => {
    if (!roomId || !supabase || joiningRef.current) return joiningRef.current ?? Promise.resolve();
    if (roomRef.current?.state === ConnectionState.Connected || roomRef.current?.state === ConnectionState.Connecting) return;

    const operation = (async () => {
      setError(null);
      setState('connecting');
      leavingRef.current = false;
      const staleRoom = roomRef.current;
      if (staleRoom?.state === ConnectionState.Disconnected) {
        staleRoom.removeAllListeners();
        roomRef.current = null;
        if (activeRoom === staleRoom) {
          activeRoom = null;
          await AudioSession.stopAudioSession().catch(() => undefined);
        }
      }
      if (activeRoom && activeRoom !== roomRef.current) {
        await activeRoom.disconnect(true).catch(() => undefined);
        await AudioSession.stopAudioSession().catch(() => undefined);
        activeRoom = null;
      }

      const { data, error: tokenError } = await supabase.functions.invoke<TokenResponse>('livekit-token', {
        body: { channel_id: roomId },
      });
      if (tokenError) throw tokenError;
      if (!data?.server_url || !data.participant_token) throw new Error('The voice token service returned an incomplete response.');

      const room = new Room({
        adaptiveStream: false,
        dynacast: false,
        audioCaptureDefaults: { autoGainControl: true, echoCancellation: true, noiseSuppression: true },
        publishDefaults: { audioPreset: AudioPresets.speech, dtx: true, red: true },
      });
      roomRef.current = room;
      activeRoom = room;

      room.on(RoomEvent.ConnectionStateChanged, refresh);
      room.on(RoomEvent.ActiveSpeakersChanged, refresh);
      room.on(RoomEvent.TrackMuted, refresh);
      room.on(RoomEvent.TrackUnmuted, refresh);
      room.on(RoomEvent.TrackPublished, refresh);
      room.on(RoomEvent.TrackUnpublished, refresh);
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track instanceof RemoteAudioTrack) track.setVolume(deafenedRef.current ? 0 : 1);
        refresh();
      });
      room.on(RoomEvent.ParticipantConnected, (participant) => {
        refresh();
        showNotice(`${participant.name || 'Someone'} joined`);
      });
      room.on(RoomEvent.ParticipantDisconnected, (participant) => {
        refresh();
        showNotice(`${participant.name || 'Someone'} left`);
      });
      room.on(RoomEvent.Disconnected, () => {
        refresh();
        if (!leavingRef.current) setError('The voice connection ended. Tap to reconnect.');
      });

      await AudioSession.configureAudio({
        android: {
          audioTypeOptions: AndroidAudioTypePresets.communication,
          preferredOutputList: ['bluetooth', 'headset', 'speaker', 'earpiece'],
        },
        ios: { defaultOutput: 'speaker' },
      });
      await AudioSession.startAudioSession();
      await room.connect(data.server_url, data.participant_token, { autoSubscribe: true, maxRetries: 3 });
      await room.localParticipant.setMicrophoneEnabled(true);
      if (!room.localParticipant.isMicrophoneEnabled) throw new Error('Microphone permission was not granted.');
      refresh();
    })().catch(async (reason) => {
      const room = roomRef.current;
      if (room) {
        room.removeAllListeners();
        await room.disconnect(true).catch(() => undefined);
        const ownsAudioSession = activeRoom === room;
        if (ownsAudioSession) activeRoom = null;
        roomRef.current = null;
        if (ownsAudioSession) await AudioSession.stopAudioSession().catch(() => undefined);
      }
      setParticipants([]);
      setState('disconnected');
      setError(friendlyError(reason));
    }).finally(() => {
      joiningRef.current = null;
    });
    joiningRef.current = operation;
    return operation;
  }, [refresh, roomId, showNotice]);

  const setMuted = useCallback(async (value: boolean) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    try {
      await room.localParticipant.setMicrophoneEnabled(!value);
      setMutedState(!room.localParticipant.isMicrophoneEnabled);
      refresh();
    } catch (reason) {
      setError(friendlyError(reason));
    }
  }, [refresh]);

  const setDeafened = useCallback(async (value: boolean) => {
    const room = roomRef.current;
    if (!room || room.state !== ConnectionState.Connected) return;
    try {
      await AudioSession.setDefaultRemoteAudioTrackVolume(value ? 0 : 1);
      room.remoteParticipants.forEach((participant) => participant.setVolume(value ? 0 : 1));
      deafenedRef.current = value;
      setDeafenedState(value);
    } catch (reason) {
      setError(friendlyError(reason));
    }
  }, []);

  const chooseAudioOutput = useCallback(async () => {
    try {
      if (Platform.OS === 'ios') {
        await AudioSession.showAudioRoutePicker();
        return;
      }
      if (Platform.OS === 'android' && Number(Platform.Version) >= 31) {
        await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT);
      }
      const outputs = await AudioSession.getAudioOutputs();
      if (!outputs.length) throw new Error('No audio outputs are currently available.');
      const buttons: AlertButton[] = outputs.map((output) => ({
        text: output.replace('_', ' '),
        onPress: () => { void AudioSession.selectAudioOutput(output).catch((reason) => setError(friendlyError(reason))); },
      }));
      buttons.push({ text: 'Cancel', style: 'cancel' });
      Alert.alert('Audio output', undefined, buttons);
    } catch (reason) {
      setError(friendlyError(reason));
    }
  }, []);

  useEffect(() => {
    void join();
    return () => {
      if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
      void leave();
    };
  }, [join, leave]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  return { connectionState: state, participants, muted, deafened, error, notice, join, leave, setMuted, setDeafened, chooseAudioOutput };
}
