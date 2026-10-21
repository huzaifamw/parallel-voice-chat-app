import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInUp, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, QueryState } from '@/components/ui/app-ui';
import { palette, Radius } from '@/constants/theme';
import { Profile, toPerson } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

export default function VoiceRoomScreen() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const { session } = useAuth();
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [pushToTalk, setPushToTalk] = useState(false);
  const [callId, setCallId] = useState<string | null>(null);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('Voice');
  const [roomName, setRoomName] = useState('Room');
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session || !roomId) return;
    setLoading(true); setError(null);
    try {
      const { data: channel, error: channelError } = await supabase.from('channels').select('id, name, group_id, groups(name)').eq('id', roomId).eq('kind', 'voice').single();
      if (channelError) throw channelError;
      const group = Array.isArray(channel.groups) ? channel.groups[0] : channel.groups;
      setRoomName(channel.name); setGroupName(group?.name ?? 'Group'); setGroupId(channel.group_id);
      let { data: call, error: callError } = await supabase.from('call_sessions').select('id').eq('channel_id', roomId).eq('status', 'active').order('started_at', { ascending: false }).limit(1).maybeSingle();
      if (callError) throw callError;
      if (!call) {
        const created = await supabase.from('call_sessions').insert({ channel_id: roomId, started_by: session.user.id, provider_room_name: `${roomId}-${Date.now()}`, mode: 'voice' }).select('id').single();
        if (created.error) throw created.error;
        call = created.data;
      }
      setCallId(call.id);
      const { data: ownRows, error: ownError } = await supabase.from('call_participants').select('joined_at, microphone_muted, deafened, push_to_talk').eq('call_id', call.id).eq('user_id', session.user.id).is('left_at', null).limit(1);
      if (ownError) throw ownError;
      const own = ownRows?.[0];
      if (!own) {
        const joined = await supabase.from('call_participants').insert({ call_id: call.id, user_id: session.user.id });
        if (joined.error) throw joined.error;
      } else { setMuted(own.microphone_muted); setDeafened(own.deafened); setPushToTalk(own.push_to_talk); }
      const { data: rows, error: participantError } = await supabase.from('call_participants').select('user_id, microphone_muted, profiles(*)').eq('call_id', call.id).is('left_at', null).order('joined_at');
      if (participantError) throw participantError;
      setPeople((rows ?? []).map((row: any) => { const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; return profile ? { ...toPerson(profile as Profile), muted: row.microphone_muted } : null; }).filter(Boolean));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not join the room.'); }
    finally { setLoading(false); }
  }, [roomId, session]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supabase || !callId) return;
    const channel = supabase.channel(`call:${callId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'call_participants', filter: `call_id=eq.${callId}` }, () => void load()).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [callId, load]);

  const updateControl = async (field: 'microphone_muted' | 'deafened' | 'push_to_talk', value: boolean) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!supabase || !session || !callId) return;
    const { error: updateError } = await supabase.from('call_participants').update({ [field]: value }).eq('call_id', callId).eq('user_id', session.user.id).is('left_at', null);
    if (updateError) Alert.alert('Could not update voice state', updateError.message);
  };
  const leave = async () => {
    if (supabase && session && callId) await supabase.from('call_participants').update({ left_at: new Date().toISOString() }).eq('call_id', callId).eq('user_id', session.user.id).is('left_at', null);
    router.back();
  };
  return (
    <SafeAreaView style={styles.safe}>
      <Pressable onPress={leave} style={styles.backRow}><Ionicons name="chevron-back" size={24} color={palette.text} /><Text style={styles.backText}>{groupName}</Text></Pressable>
      <Text style={styles.title}>{roomName}</Text>
      <View style={styles.connection}><View style={styles.connectionDot} /><Text style={styles.connectionText}>{loading ? 'Connecting…' : error ? 'Disconnected' : `Connected · ${people.length} / 25`}</Text></View>
      {error ? <QueryState error={error} onRetry={load} /> : null}
      <View style={styles.peopleGrid}>
        {people.slice(0, 5).map((person, index) => (
          <Animated.View entering={ZoomIn.springify().damping(17).delay(index * 55)} key={person.id} style={styles.personTile}>
            <Avatar person={person} size={70} showStatus={false} />
            <Text style={styles.personName}>{person.name}</Text><View style={styles.personStateRow}><Ionicons name={person.muted ? 'mic-off' : 'volume-medium'} size={12} color={person.muted ? palette.red : palette.green} /><Text style={styles.personState}>{person.muted ? 'Muted' : 'Listening'}</Text></View>
          </Animated.View>
        ))}
        <Pressable onPress={() => router.push('/friends')} style={styles.emptyTile}><View style={styles.inviteCircle}><Ionicons name="person-add" size={21} color={palette.textMuted} /></View><Text style={styles.inviteLabel}>Invite friend</Text></Pressable>
      </View>
      <Animated.View entering={FadeInUp.delay(180)}><LinearGradient colors={[palette.surfaceRaised, palette.surfaceRaised]} style={styles.activityPrompt}><Ionicons name="sparkles-outline" size={24} color={palette.accent} /><View><Text style={styles.activityTitle}>Bottle Spin</Text><Text style={styles.activityKicker}>{people.length} players</Text></View><Pressable onPress={() => router.push({ pathname: '/activity/bottle-spin', params: { channelId: roomId, groupId } })} style={styles.activityArrow}><Ionicons name="arrow-forward" size={22} color={palette.text} /></Pressable></LinearGradient></Animated.View>
      <Animated.View entering={FadeInUp.delay(260)} style={styles.controls}>
        <Pressable onPress={() => { setMuted(!muted); void updateControl('microphone_muted', !muted); }} style={[styles.control, muted && styles.controlActive]}><Ionicons name={muted ? 'mic-off' : 'mic'} size={20} color={palette.text} /><Text style={styles.controlLabel}>{muted ? 'Unmute' : 'Mute'}</Text></Pressable>
        <Pressable onPress={() => { setDeafened(!deafened); void updateControl('deafened', !deafened); }} style={[styles.control, deafened && styles.controlActive]}><Ionicons name={deafened ? 'volume-mute' : 'headset'} size={20} color={palette.text} /><Text style={styles.controlLabel}>Deafen</Text></Pressable>
        <Pressable onPress={() => { setPushToTalk(!pushToTalk); void updateControl('push_to_talk', !pushToTalk); }} style={[styles.control, pushToTalk && styles.controlActive]}><Ionicons name="radio" size={20} color={palette.text} /><Text style={styles.controlLabel}>Push-talk</Text></Pressable>
        <Pressable onPress={leave} style={[styles.control, styles.leave]}><Ionicons name="call" size={20} color={palette.red} style={{ transform: [{ rotate: '135deg' }] }} /><Text style={styles.controlLabel}>Leave</Text></Pressable>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas, paddingHorizontal: 24, overflow: 'hidden' },
  glowOne: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: '#F0A2722B', top: -120, right: -130 },
  glowTwo: { position: 'absolute', width: 260, height: 260, borderRadius: 130, backgroundColor: '#22A49620', bottom: -140, left: -90 },
  backRow: { height: 54, flexDirection: 'row', alignItems: 'center' }, backText: { color: palette.textMuted, fontSize: 13 },
  headerCopy: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 44 },
  kicker: { color: palette.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: palette.text, fontSize: 32, lineHeight: 42, fontWeight: '900', marginTop: 4 },
  connection: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  connectionDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.green },
  connectionText: { color: palette.textMuted, fontSize: 10, fontWeight: '700' },
  peopleGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignContent: 'center', marginHorizontal: -6 },
  personTile: { width: '46.5%', height: 150, margin: 6, backgroundColor: palette.surface, borderWidth: 1, borderColor: 'transparent', borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  personTileSpeaking: { borderColor: palette.accent, backgroundColor: palette.surfaceAccent },
  speakingRing: { borderWidth: 3, borderColor: palette.cyan, padding: 4, borderRadius: 44 },
  personName: { color: palette.text, fontSize: 14, fontWeight: '800', marginTop: 10 },
  personState: { color: palette.textMuted, fontSize: 10, marginTop: 3 },
  personStateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  wave: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 2, top: 13, right: 13 },
  waveBar: { width: 3, borderRadius: 2, backgroundColor: palette.cyan },
  emptyTile: { width: '46.5%', height: 160, margin: 6, borderWidth: 1, borderStyle: 'dashed', borderColor: palette.borderBright, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  inviteCircle: { width: 44, height: 44, borderRadius: 15, backgroundColor: palette.surfaceSoft, alignItems: 'center', justifyContent: 'center' },
  inviteLabel: { color: palette.textMuted, fontSize: 11, marginTop: 6 },
  activityPrompt: { height: 67, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, paddingHorizontal: 14, marginBottom: 18 },
  activityKicker: { color: palette.textMuted, fontSize: 11, marginTop: 3 },
  activityTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
  activityArrow: { marginLeft: 'auto' },
  activityButton: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.accent, borderRadius: Radius.pill, paddingHorizontal: 18, paddingVertical: 10 },
  activityButtonText: { color: palette.white, fontSize: 12, fontWeight: '900' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12, paddingBottom: 10 },
  control: { width: '30%', height: 72, borderRadius: 18, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' },
  controlActive: { backgroundColor: palette.accent, borderColor: palette.accentBright },
  controlLabel: { color: palette.textMuted, fontSize: 9, fontWeight: '700', marginTop: 5 },
  leave: { width: '100%', height: 46, backgroundColor: palette.surfaceRaised, borderColor: 'transparent' },
});
