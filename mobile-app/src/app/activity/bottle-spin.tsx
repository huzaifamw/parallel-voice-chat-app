import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, IconButton, PrimaryButton, QueryState } from '@/components/ui/app-ui';
import { palette } from '@/constants/theme';
import { Profile, toPerson } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';

const positions = [
  { top: 5, left: '39%' },
  { top: '35%', right: 0 },
  { bottom: 0, right: '14%' },
  { bottom: 0, left: '14%' },
  { top: '35%', left: 0 },
] as const;

export default function BottleSpinScreen() {
  const params = useLocalSearchParams<{ groupId?: string; channelId?: string }>();
  const { session } = useAuth();
  const rotation = useRef(new Animated.Value(0)).current;
  const [selected, setSelected] = useState<string | null>(null);
  const [decider, setDecider] = useState<string | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [createdBy, setCreatedBy] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('Your group');
  const [people, setPeople] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase || !session) return;
    setLoading(true); setError(null);
    try {
      let groupId = params.groupId;
      if (!groupId) {
        const { data, error: membershipError } = await supabase.from('group_members').select('group_id').eq('user_id', session.user.id).limit(1).maybeSingle();
        if (membershipError) throw membershipError;
        groupId = data?.group_id;
      }
      if (!groupId) throw new Error('Join a group before starting Bottle Spin.');
      const { data: group, error: groupError } = await supabase.from('groups').select('name').eq('id', groupId).single();
      if (groupError) throw groupError;
      setGroupName(group.name);
      let { data: activity, error: activityError } = await supabase.from('activity_sessions').select('id, created_by').eq('group_id', groupId).eq('activity_type', 'bottle_spin').in('status', ['lobby', 'active']).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (activityError) throw activityError;
      if (!activity) {
        const created = await supabase.from('activity_sessions').insert({ group_id: groupId, channel_id: params.channelId || null, created_by: session.user.id, activity_type: 'bottle_spin', status: 'active', started_at: new Date().toISOString() }).select('id, created_by').single();
        if (created.error) throw created.error;
        activity = created.data;
      }
      setActivityId(activity.id); setCreatedBy(activity.created_by);
      const { error: joinError } = await supabase.from('activity_participants').upsert({ session_id: activity.id, user_id: session.user.id }, { onConflict: 'session_id,user_id', ignoreDuplicates: true });
      if (joinError) throw joinError;
      const { data: participants, error: participantError } = await supabase.from('activity_participants').select('user_id, seat_position, joined_at, profiles(*)').eq('session_id', activity.id).order('seat_position').order('joined_at');
      if (participantError) throw participantError;
      setPeople((participants ?? []).map((item: any) => { const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles; return profile ? toPerson(profile as Profile) : null; }).filter(Boolean).slice(0, 5));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not start the activity.'); }
    finally { setLoading(false); }
  }, [params.channelId, params.groupId, session]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!supabase || !activityId) return;
    const channel = supabase.channel(`activity:${activityId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'activity_participants', filter: `session_id=eq.${activityId}` }, () => void load()).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [activityId, load]);

  const spin = () => {
    if (spinning || !activityId || !session || !supabase) return;
    if (people.length < 3) { Alert.alert('More players needed', 'At least three people must join this activity.'); return; }
    if (createdBy !== session.user.id) { Alert.alert('Waiting for the host', 'Only the person who started this activity can spin.'); return; }
    setSelected(null); setDecider(null); setSpinning(true); rotation.setValue(0);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const winnerIndex = Math.floor(Math.random() * people.length);
    const oppositeIndex = (winnerIndex + Math.floor(people.length / 2)) % people.length;
    Animated.timing(rotation, { toValue: 1, duration: 2200, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(async () => {
      const winner = people[winnerIndex]; const opposite = people[oppositeIndex];
      const { error: spinError } = await supabase!.from('bottle_spins').insert({ session_id: activityId, spun_by: session.user.id, selected_user_id: winner.id, deciding_user_id: opposite.id, server_seed_hash: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
      if (spinError) Alert.alert('Could not save spin', spinError.message);
      else void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSelected(winner.name); setDecider(opposite.name); setSpinning(false);
    });
  };
  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '1620deg'] });
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.header}><IconButton label="×" onPress={() => router.back()} /><View style={styles.headerCopy}><Text style={styles.kicker}>{groupName.toUpperCase()}</Text><Text style={styles.title}>Bottle Spin</Text></View><IconButton label="?" onPress={() => Alert.alert('How to play', 'At least three people join. The host spins, one player is chosen, and the person sitting opposite decides the challenge.')} /></View>
      {loading || error ? <QueryState loading={loading} error={error} onRetry={load} /> : null}
      <View style={styles.copy}><Text style={styles.headline}>{selected ? `${selected} was chosen!` : spinning ? 'Spinning…' : 'Who will it choose?'}</Text><Text style={styles.instructions}>{selected ? `${decider} is sitting opposite and decides the challenge.` : `${people.length} joined · at least 3 players are required.`}</Text></View>
      <View style={styles.arena}>
        <Image source={require('@/assets/images/figma/bottle-arena.png')} style={styles.orbitArtwork} resizeMode="contain" />
        {people.map((person, index) => <View key={person.id} style={[styles.person, positions[index]]}><Avatar person={person} size={58} showStatus={false} /><Text style={styles.personName}>{person.name}</Text></View>)}
        <Pressable style={styles.bottleButton} onPress={spin}><LinearGradient colors={['#173D32', '#62DDC0']} style={styles.bottleGradient}>
          <Animated.View style={[styles.bottle, { transform: [{ rotate }] }]}><View style={styles.bottleNeck} /><LinearGradient colors={[palette.cyan, '#168F8D']} style={styles.bottleBody}><Ionicons name="sparkles" size={16} color="#DFFFFB" /></LinearGradient></Animated.View>
        </LinearGradient></Pressable>
      </View>
      <View style={styles.footer}>{selected ? <PrimaryButton label="Spin again" onPress={spin} /> : <PrimaryButton label={spinning ? 'Choosing…' : people.length < 3 ? `Waiting for ${3 - people.length} more` : 'Spin the bottle'} onPress={spin} />}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.canvas, paddingHorizontal: 24, overflow: 'hidden' },
  glowOne: { position: 'absolute', width: 300, height: 300, borderRadius: 150, backgroundColor: '#F0A27225', top: -140, right: -130 },
  glowTwo: { position: 'absolute', width: 280, height: 280, borderRadius: 140, backgroundColor: '#22A49618', bottom: -150, left: -130 },
  header: { height: 70, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerCopy: { flex: 1, alignItems: 'center' },
  kicker: { color: palette.accentBright, fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: palette.text, fontSize: 17, fontWeight: '900', marginTop: 4 },
  copy: { alignItems: 'center', marginTop: 10 },
  headline: { color: palette.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  instructions: { color: palette.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', maxWidth: 310, marginTop: 8 },
  arena: { flex: 1, minHeight: 420, marginVertical: 16 },
  orbitArtwork: { position: 'absolute', width: '100%', height: '100%', left: 0, top: 0 },
  person: { position: 'absolute', alignItems: 'center', width: 80 },
  personName: { color: palette.text, fontSize: 10, fontWeight: '700', marginTop: 6 },
  bottleButton: { position: 'absolute', width: 104, height: 138, left: '50%', top: '50%', marginLeft: -52, marginTop: -69, borderRadius: 28, overflow: 'hidden' },
  bottleGradient: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottle: { width: 34, height: 105, alignItems: 'center' },
  bottleNeck: { width: 13, height: 30, borderTopLeftRadius: 6, borderTopRightRadius: 6, backgroundColor: palette.cyan },
  bottleBody: { width: 34, height: 64, borderRadius: 12, borderTopLeftRadius: 8, borderTopRightRadius: 8, backgroundColor: '#31AFA6', alignItems: 'center', justifyContent: 'center' },
  footer: { paddingBottom: 12 },
});
