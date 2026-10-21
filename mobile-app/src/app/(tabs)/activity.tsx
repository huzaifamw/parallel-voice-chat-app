import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Image, StyleSheet, Text, View } from 'react-native';

import { Card, Header, PrimaryButton, QueryState, Screen, SectionHeader } from '@/components/ui/app-ui';
import { palette } from '@/constants/theme';
import { loadFriends, loadGroups, relativeTime } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/use-supabase-query';
import { useAuth } from '@/providers/auth-provider';

export default function ActivityScreen() {
  const { session } = useAuth();
  const query = useSupabaseQuery(async () => {
    if (!session || !supabase) return { friends: [], groups: [], activities: [], calls: [] };
    const [friends, groups] = await Promise.all([loadFriends(session.user.id), loadGroups(session.user.id)]);
    const groupIds = groups.map((group) => group.id);
    if (!groupIds.length) return { friends: friends.people, groups, activities: [], calls: [] };
    const [{ data: activities, error: activityError }, { data: channels }] = await Promise.all([
      supabase.from('activity_sessions').select('id, activity_type, status, created_at, groups(name), profiles!activity_sessions_created_by_fkey(display_name)').in('group_id', groupIds).order('created_at', { ascending: false }).limit(10),
      supabase.from('channels').select('id, group_id, name').in('group_id', groupIds).eq('kind', 'voice'),
    ]);
    if (activityError) throw activityError;
    const voiceIds = (channels ?? []).map((channel) => channel.id);
    let calls: any[] = [];
    if (voiceIds.length) {
      const result = await supabase.from('call_sessions').select('id, channel_id, call_participants(user_id, left_at)').in('channel_id', voiceIds).eq('status', 'active');
      if (result.error) throw result.error;
      calls = (result.data ?? []).map((call: any) => ({ ...call, channel: channels?.find((channel) => channel.id === call.channel_id) }));
    }
    return { friends: friends.people, groups, activities: activities ?? [], calls };
  }, [session?.user.id], { friends: [], groups: [], activities: [], calls: [] } as any);
  const firstGroup = query.data.groups[0];
  return (
    <Screen>
      <Header title="Activities" />
      <View style={styles.hero}><Image source={require('@/assets/images/figma/activity-orbit.png')} style={styles.heroArtwork} resizeMode="contain" /><Text style={styles.heroTitle}>Bottle Spin</Text><Text style={styles.heroBody}>{query.data.calls[0]?.call_participants?.length ?? 0} players · In voice</Text><PrimaryButton label={firstGroup ? 'Play' : 'Join a group to play'} onPress={firstGroup ? () => router.push({ pathname: '/activity/bottle-spin', params: { groupId: firstGroup.id } }) : undefined} /></View>
      <View>
        <SectionHeader title="Recent" />
        <View style={styles.list}>
          {query.data.activities.map((item: any) => { const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles; const group = Array.isArray(item.groups) ? item.groups[0] : item.groups; return <Card key={item.id} style={styles.activityRow}><View style={styles.activityIcon}><Ionicons name="sparkles" size={19} color={palette.accentBright} /></View><View style={styles.copy}><Text style={styles.activityTitle}>{profile?.display_name ?? 'A member'} started {item.activity_type === 'bottle_spin' ? 'Bottle Spin' : item.activity_type.replace('_', ' ')}</Text><Text style={styles.activityMeta}>{group?.name ?? 'Group'} · {relativeTime(item.created_at)} ago</Text></View></Card>; })}
          {query.data.calls.map((call: any) => <Card key={call.id} style={styles.activityRow}><View style={styles.activityIcon}><Ionicons name="headset" size={19} color={palette.cyan} /></View><View style={styles.copy}><Text style={styles.activityTitle}>{call.channel?.name ?? 'Voice room'} is active</Text><Text style={styles.activityMeta}>{call.call_participants.filter((person: any) => !person.left_at).length} people are talking now</Text></View></Card>)}
          {query.loading || query.error ? <QueryState loading={query.loading} error={query.error} onRetry={query.refresh} /> : null}
          {!query.loading && !query.error && !query.data.activities.length && !query.data.calls.length ? <QueryState empty="Your group activity will appear here." /> : null}
        </View>
      </View>
      <View><SectionHeader title="Coming soon" /><View style={styles.comingRow}>{['Watch parties', 'Quizzes', 'Drawing'].map((label) => <View key={label} style={styles.comingCard}><Ionicons name="sparkles-outline" size={21} color={palette.textMuted} /><Text style={styles.comingText}>{label}</Text></View>)}</View></View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { height: 326, backgroundColor: palette.surface, borderRadius: 18, padding: 20 }, heroArtwork: { width: '100%', height: 126 }, heroTitle: { color: palette.text, fontSize: 30, lineHeight: 39, fontWeight: '900', letterSpacing: -.6, marginTop: 15 }, heroBody: { color: palette.textMuted, fontSize: 13, marginTop: 12, marginBottom: 16 },
  list: { gap: 10 },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: 13, borderRadius: 16 },
  activityIcon: { width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceAccent },
  copy: { flex: 1, gap: 4 },
  activityTitle: { color: palette.text, fontSize: 14, fontWeight: '700' },
  activityMeta: { color: palette.textMuted, fontSize: 11 },
  comingRow: { flexDirection: 'row', gap: 12 }, comingCard: { flex: 1, height: 76, backgroundColor: palette.surface, borderRadius: 18, padding: 12, justifyContent: 'space-between' }, comingText: { color: palette.textMuted, fontSize: 11 },
});
