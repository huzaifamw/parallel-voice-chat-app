import type { Person } from '@/lib/app-data';

export type VoiceConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export type VoiceParticipant = {
  person: Person;
  isLocal: boolean;
  muted: boolean;
  speaking: boolean;
};

export type VoiceRoomState = {
  connectionState: VoiceConnectionState;
  participants: VoiceParticipant[];
  muted: boolean;
  deafened: boolean;
  error: string | null;
  notice: string | null;
  join: () => Promise<void>;
  leave: () => Promise<void>;
  setMuted: (value: boolean) => Promise<void>;
  setDeafened: (value: boolean) => Promise<void>;
  chooseAudioOutput: () => Promise<void>;
};
