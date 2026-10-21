import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, Card, IconButton, PrimaryButton, QueryState, Screen, SectionHeader } from '@/components/ui/app-ui';
import { palette, Radius } from '@/constants/theme';
import { Person, Profile, toPerson } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/use-supabase-query';
import { useAuth } from '@/providers/auth-provider';

type Relationship = { status: 'pending' | 'accepted' | 'declined'; requester_id: string; addressee_id: string } | null;

export default function UserProfileScreen() {
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const { session } = useAuth();
  const [working, setWorking] = useState(false);
  const query = useSupabaseQuery(async () => {
    if (!supabase || !session || !userId) return null;
    const [profileResult, mutualResult, relationshipResult] = await Promise.all([
      supabase.from('profiles').select('id, username, display_name, bio, avatar_path, status, favorite_games, interests, last_seen_at').eq('id', userId).maybeSingle(),
      supabase.rpc('get_mutual_friends', { target_user_id: userId }),
      supabase.from('friendships').select('status, requester_id, addressee_id').or(`and(requester_id.eq.${session.user.id},addressee_id.eq.${userId}),and(requester_id.eq.${userId},addressee_id.eq.${session.user.id})`).maybeSingle(),
    ]);
    if (profileResult.error) throw profileResult.error;
    if (!profileResult.data) throw new Error('This profile is unavailable.');
    if (mutualResult.error) throw mutualResult.error;
    if (relationshipResult.error) throw relationshipResult.error;
    const profile = profileResult.data as Profile;
    const mutual = (mutualResult.data ?? []).map((item: any) => toPerson({ ...item, bio: '', favorite_games: [], interests: [], last_seen_at: null } as Profile));
    return { profile, person: toPerson(profile), mutual, relationship: relationshipResult.data as Relationship };
  }, [session?.user.id, userId], null as null | { profile: Profile; person: Person; mutual: Person[]; relationship: Relationship });

  const sendRequest = async () => {
    if (!supabase || !session || !userId || working) return;
    setWorking(true);
    const { error } = await supabase.from('friendships').insert({ requester_id: session.user.id, addressee_id: userId });
    setWorking(false);
    if (error) Alert.alert('Could not send request', error.message); else await query.refresh();
  };
  const acceptRequest = async () => {
    const relationship = query.data?.relationship;
    if (!supabase || !relationship || working) return;
    setWorking(true);
    const { error } = await supabase.from('friendships').update({ status: 'accepted', updated_at: new Date().toISOString() }).eq('requester_id', relationship.requester_id).eq('addressee_id', relationship.addressee_id);
    setWorking(false);
    if (error) Alert.alert('Could not accept request', error.message); else await query.refresh();
  };

  if (query.loading || query.error || !query.data) return <Screen><View style={styles.back}><IconButton label="‹" onPress={() => router.back()} /></View><QueryState loading={query.loading} error={query.error} empty={!query.loading && !query.error ? 'Profile not found.' : undefined} onRetry={query.refresh} /></Screen>;
  const { profile, person, mutual, relationship } = query.data;
  const ownProfile = session?.user.id === userId;
  const incoming = relationship?.status === 'pending' && relationship.addressee_id === session?.user.id;
  return <Screen>
    <View style={styles.back}><IconButton label="‹" onPress={() => router.back()} /><Text style={styles.backLabel}>Profile</Text><View style={styles.backSpacer} /></View>
    <Animated.View entering={FadeInDown.springify().damping(18)}><Card style={styles.hero}><View style={styles.avatarGlow}><Avatar person={person} size={94} /></View><Text style={styles.name}>{profile.display_name}</Text><Text style={styles.handle}>@{profile.username}</Text><View style={styles.presence}><View style={[styles.presenceDot, { backgroundColor: profile.status === 'online' ? palette.green : palette.textSubtle }]} /><Text style={styles.presenceText}>{profile.status === 'online' ? 'Online now' : 'Offline'}</Text></View>{profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}<View style={styles.tags}>{[...profile.favorite_games, ...profile.interests].slice(0, 6).map((item) => <Text key={item} style={styles.tag}>{item}</Text>)}</View></Card></Animated.View>
    {!ownProfile ? <View style={styles.actions}>{relationship?.status === 'accepted' ? <PrimaryButton label="Message" onPress={() => router.push(`/channel/dm-${userId}`)} /> : incoming ? <PrimaryButton label={working ? 'Accepting…' : 'Accept friend request'} onPress={() => void acceptRequest()} /> : relationship?.status === 'pending' ? <PrimaryButton label="Request pending" tone="quiet" /> : <PrimaryButton label={working ? 'Sending…' : 'Add friend'} onPress={() => void sendRequest()} />}</View> : null}
    <View><SectionHeader title={`Mutual friends · ${mutual.length}`} />{mutual.length ? <View style={styles.mutualList}>{mutual.map((friend: Person) => <Pressable key={friend.id} onPress={() => router.push({ pathname: '/user/[userId]', params: { userId: friend.id } })} style={styles.mutualRow}><Avatar person={friend} size={44} /><View style={styles.mutualCopy}><Text style={styles.mutualName}>{friend.name}</Text><Text style={styles.mutualHandle}>{friend.handle}</Text></View><Ionicons name="chevron-forward" size={17} color={palette.textSubtle} /></Pressable>)}</View> : <QueryState empty="You don’t have any mutual friends yet." />}</View>
  </Screen>;
}

const styles = StyleSheet.create({
  back: { height: 44, flexDirection: 'row', alignItems: 'center', marginHorizontal: -10 }, backLabel: { flex: 1, color: palette.textMuted, fontSize: 12, fontWeight: '700' }, backSpacer: { width: 44 },
  hero: { alignItems: 'center', padding: 24, borderWidth: 1, borderColor: palette.border }, avatarGlow: { padding: 4, borderRadius: 54, backgroundColor: palette.surfaceRaised }, name: { color: palette.text, fontSize: 25, lineHeight: 32, fontWeight: '900', textAlign: 'center', marginTop: 14 }, handle: { color: palette.textMuted, fontSize: 12, marginTop: 3 }, presence: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: palette.surfaceRaised, paddingHorizontal: 10, paddingVertical: 6, borderRadius: Radius.pill }, presenceDot: { width: 6, height: 6, borderRadius: 3 }, presenceText: { color: palette.textMuted, fontSize: 9, fontWeight: '800' }, bio: { color: palette.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 16, maxWidth: 420 }, tags: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 7, marginTop: 15 }, tag: { color: palette.accentSoft, backgroundColor: palette.surfaceRaised, borderRadius: Radius.pill, paddingHorizontal: 10, paddingVertical: 6, fontSize: 10, fontWeight: '700' },
  actions: { gap: 10 }, mutualList: { gap: 6 }, mutualRow: { minHeight: 62, borderRadius: 18, backgroundColor: palette.surface, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, mutualCopy: { flex: 1, gap: 3 }, mutualName: { color: palette.text, fontSize: 13, fontWeight: '800' }, mutualHandle: { color: palette.textMuted, fontSize: 10 },
});
