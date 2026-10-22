import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, QueryState } from '@/components/ui/app-ui';
import { palette, Shadows } from '@/constants/theme';
import { useVoiceRoom } from '@/hooks/use-voice-room';
import { supabase } from '@/lib/supabase';

export default function VoiceRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('Voice');
  const [roomName, setRoomName] = useState('Room');
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const voice = useVoiceRoom(roomId);
  const connected = voice.connectionState === 'connected';

  const loadRoom = useCallback(async () => {
    if (!supabase || !roomId) return;
    setMetadataError(null);
    const { data: channel, error } = await supabase.from('channels').select('id, name, group_id, groups(name)').eq('id', roomId).eq('kind', 'voice').single();
    if (error) { setMetadataError(error.message); return; }
    const group = Array.isArray(channel.groups) ? channel.groups[0] : channel.groups;
    setRoomName(channel.name);
    setGroupName(group?.name ?? 'Group');
    setGroupId(channel.group_id);
  }, [roomId]);

  useEffect(() => { void loadRoom(); }, [loadRoom]);

  const leave = async () => { await voice.leave(); router.back(); };
  const statusLabel = voice.connectionState === 'connected'
    ? `Connected · ${voice.participants.length} / 25`
    : voice.connectionState === 'reconnecting' ? 'Reconnecting…'
      : voice.connectionState === 'connecting' ? 'Connecting…' : 'Disconnected';

  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={() => void leave()} style={styles.backRow}><Ionicons name="chevron-back" size={24} color={palette.text} /><Text style={styles.backText}>{groupName}</Text></Pressable>
      <Text style={styles.title}>{roomName}</Text>
      <View style={styles.connection}>
        <View style={[styles.connectionDot, voice.connectionState === 'reconnecting' && styles.connectionReconnecting, voice.connectionState === 'disconnected' && styles.connectionDisconnected]} />
        <Text style={styles.connectionText}>{statusLabel}</Text>
      </View>
      {voice.notice ? <Animated.Text entering={FadeInUp.duration(180)} style={styles.notice}>{voice.notice}</Animated.Text> : null}
      {metadataError ? <QueryState error={metadataError} onRetry={loadRoom} /> : null}
      {voice.error ? <QueryState error={voice.error} onRetry={voice.join} /> : null}

      <View style={styles.peopleGrid}>
        {voice.participants.slice(0, 5).map((participant, index) => (
          <Animated.View entering={ZoomIn.springify().damping(17).delay(index * 55)} key={participant.person.id} style={[styles.personTile, participant.speaking && styles.personTileSpeaking]}>
            <View style={participant.speaking ? styles.speakingRing : undefined}><Avatar person={participant.person} size={70} showStatus={false} /></View>
            <Text numberOfLines={1} style={styles.personName}>{participant.person.name}{participant.isLocal ? ' · You' : ''}</Text>
            <View style={styles.personStateRow}><Ionicons name={participant.muted ? 'mic-off' : participant.speaking ? 'volume-high' : 'volume-medium'} size={12} color={participant.muted ? palette.red : participant.speaking ? palette.cyan : palette.green} /><Text style={styles.personState}>{participant.muted ? 'Muted' : participant.speaking ? 'Speaking' : 'Listening'}</Text></View>
          </Animated.View>
        ))}
        <Pressable onPress={() => router.push('/friends')} style={styles.emptyTile}><View style={styles.inviteCircle}><Ionicons name="person-add" size={21} color={palette.textMuted} /></View><Text style={styles.inviteLabel}>Invite friend</Text></Pressable>
      </View>

      <Animated.View entering={FadeInUp.delay(180)}><LinearGradient colors={[palette.surfaceRaised, palette.surfaceRaised]} style={styles.activityPrompt}><Ionicons name="sparkles-outline" size={24} color={palette.accent} /><View><Text style={styles.activityTitle}>Bottle Spin</Text><Text style={styles.activityKicker}>{voice.participants.length} players</Text></View><Pressable onPress={() => router.push({ pathname: '/activity/bottle-spin', params: { channelId: roomId, groupId } })} style={styles.activityArrow}><Ionicons name="arrow-forward" size={22} color={palette.text} /></Pressable></LinearGradient></Animated.View>

      <Animated.View entering={FadeInUp.delay(260)} style={styles.controls}>
        <Pressable disabled={!connected} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); void voice.setMuted(!voice.muted); }} style={[styles.control, voice.muted && styles.controlActive, !connected && styles.controlDisabled]}><Ionicons name={voice.muted ? 'mic-off' : 'mic'} size={20} color={palette.text} /><Text style={styles.controlLabel}>{voice.muted ? 'Unmute' : 'Mute'}</Text></Pressable>
        <Pressable disabled={!connected} onPress={() => { void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); void voice.setDeafened(!voice.deafened); }} style={[styles.control, voice.deafened && styles.controlActive, !connected && styles.controlDisabled]}><Ionicons name={voice.deafened ? 'volume-mute' : 'headset'} size={20} color={palette.text} /><Text style={styles.controlLabel}>{voice.deafened ? 'Undeafen' : 'Deafen'}</Text></Pressable>
        <Pressable disabled={!connected} onPress={() => { void Haptics.selectionAsync(); void voice.chooseAudioOutput(); }} style={[styles.control, !connected && styles.controlDisabled]}><Ionicons name="volume-high" size={20} color={palette.text} /><Text style={styles.controlLabel}>Audio</Text></Pressable>
        <Pressable onPress={() => void leave()} style={[styles.control, styles.leave]}><Ionicons name="call" size={20} color={palette.red} style={{ transform: [{ rotate: '135deg' }] }} /><Text style={styles.controlLabel}>Leave</Text></Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas, paddingHorizontal: 24, overflow: 'hidden' },
  backRow: { height: 54, flexDirection: 'row', alignItems: 'center' }, backText: { color: palette.textMuted, fontSize: 13 },
  title: { color: palette.text, fontSize: 32, lineHeight: 42, fontWeight: '900', marginTop: 4 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 }, connectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.green },
  connectionReconnecting: { backgroundColor: palette.amber }, connectionDisconnected: { backgroundColor: palette.red }, connectionText: { color: palette.textMuted, fontSize: 10, fontWeight: '700' },
  notice: { color: palette.cyan, fontSize: 11, fontWeight: '700', marginTop: 8 },
  peopleGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', marginHorizontal: -6 },
  personTile: { width: '46.5%', height: 150, margin: 6, backgroundColor: palette.surface, borderWidth: 1, borderColor: 'transparent', borderRadius: 18, alignItems: 'center', justifyContent: 'center', ...Shadows.soft },
  personTileSpeaking: { borderColor: palette.accent, backgroundColor: palette.surfaceAccent }, speakingRing: { borderWidth: 3, borderColor: palette.cyan, padding: 4, borderRadius: 44 },
  personName: { maxWidth: '88%', color: palette.text, fontSize: 14, fontWeight: '800', marginTop: 10 }, personState: { color: palette.textMuted, fontSize: 10, marginTop: 3 }, personStateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  emptyTile: { width: '46.5%', height: 150, margin: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.borderBright, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  inviteCircle: { width: 44, height: 44, borderRadius: 15, backgroundColor: palette.surfaceSoft, alignItems: 'center', justifyContent: 'center' }, inviteLabel: { color: palette.textMuted, fontSize: 11, marginTop: 6 },
  activityPrompt: { height: 67, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingHorizontal: 14, marginBottom: 18 }, activityKicker: { color: palette.textMuted, fontSize: 11, marginTop: 3 }, activityTitle: { color: palette.text, fontSize: 15, fontWeight: '800' }, activityArrow: { marginLeft: 'auto' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, paddingBottom: 10 }, control: { width: '30%', height: 72, borderRadius: 18, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  controlActive: { backgroundColor: palette.accent, borderColor: palette.accentBright }, controlDisabled: { opacity: 0.45 }, controlLabel: { color: palette.textMuted, fontSize: 9, fontWeight: '700', marginTop: 5 }, leave: { width: '100%', height: 46, backgroundColor: palette.surfaceRaised, borderColor: 'transparent' },
});
