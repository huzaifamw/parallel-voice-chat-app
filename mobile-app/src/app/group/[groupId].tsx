import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';

import { ActionSheet, Avatar, Card, Field, IconButton, PrimaryButton, QueryState, Screen, SectionHeader } from '@/components/ui/app-ui';
import { palette, Radius } from '@/constants/theme';
import { loadGroupDetail, Profile, toPerson } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/use-supabase-query';
import { useAuth } from '@/providers/auth-provider';

export default function GroupScreen() {
  const { groupId } = useLocalSearchParams<{ groupId: string }>();
  const { session } = useAuth();
  const [channelSheet, setChannelSheet] = useState(false);
  const [inviteSheet, setInviteSheet] = useState(false);
  const [channelName, setChannelName] = useState('');
  const [channelKind, setChannelKind] = useState<'text' | 'voice'>('text');
  const [saving, setSaving] = useState(false);
  const query = useSupabaseQuery(async () => {
    if (!groupId || !supabase) return null;
    const [detail, inviteResult] = await Promise.all([
      loadGroupDetail(groupId),
      supabase.from('group_invites').select('code').eq('group_id', groupId).eq('is_primary', true).is('revoked_at', null).maybeSingle(),
    ]);
    if (inviteResult.error) throw inviteResult.error;
    const voiceIds = detail.channels.filter((channel: any) => channel.kind === 'voice').map((channel: any) => channel.id);
    let calls: any[] = [];
    if (voiceIds.length) {
      const result = await supabase.from('call_sessions').select('id, channel_id, call_participants(user_id, left_at, profiles(*))').in('channel_id', voiceIds).eq('status', 'active');
      if (result.error) throw result.error;
      calls = result.data ?? [];
    }
    return { ...detail, calls, inviteCode: inviteResult.data?.code ?? null };
  }, [groupId], null as any);
  if (query.loading || query.error || !query.data) return <Screen><View style={styles.topBar}><IconButton label="‹" onPress={() => router.back()} /></View><QueryState loading={query.loading} error={query.error} empty={!query.loading && !query.error ? 'Group not found.' : undefined} onRetry={query.refresh} /></Screen>;
  const { group, channels, memberships, people, calls, inviteCode } = query.data;
  const ownMembership = memberships.find((item: any) => { const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles; return profile?.id === session?.user.id; });
  const canManage = ['owner', 'admin', 'moderator'].includes(ownMembership?.role);
  const textChannels = channels.filter((channel: any) => channel.kind === 'text');
  const voiceChannels = channels.filter((channel: any) => channel.kind === 'voice');
  const voiceChannel = voiceChannels.find((channel: any) => calls.some((call: any) => call.channel_id === channel.id)) ?? voiceChannels[0];
  const call = calls.find((item: any) => item.channel_id === voiceChannel?.id);
  const participants = (call?.call_participants ?? []).filter((item: any) => !item.left_at).map((item: any) => {
    const profile = Array.isArray(item.profiles) ? item.profiles[0] : item.profiles;
    return profile ? toPerson(profile as Profile) : null;
  }).filter(Boolean);
  const inviteLink = inviteCode ? Linking.createURL(`/join/${inviteCode}`) : '';
  const shareInvite = async (kind: 'code' | 'link' | 'both') => {
    if (!inviteCode) return Alert.alert('Invite unavailable', 'Refresh the group and try again.');
    const message = kind === 'code' ? `Join ${group.name} on Parallel with code: ${inviteCode}` : kind === 'link' ? inviteLink : `Join ${group.name} on Parallel\n\nLink: ${inviteLink}\nCode: ${inviteCode}`;
    await Share.share({ title: `Join ${group.name}`, message, url: kind === 'code' ? undefined : inviteLink });
  };
  const createChannel = async () => {
    if (!supabase || !session || !groupId || !channelName.trim() || saving) return;
    const slug = channelName.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) return;
    setSaving(true);
    const { error } = await supabase.from('channels').insert({ group_id: groupId, created_by: session.user.id, name: slug, kind: channelKind, position: channels.length });
    setSaving(false);
    if (error) Alert.alert('Could not create channel', error.message); else { setChannelName(''); setChannelSheet(false); await query.refresh(); }
  };
  return (
    <Screen>
      <Pressable onPress={() => router.back()} style={styles.backRow}><Ionicons name="chevron-back" size={24} color={palette.text} /><Text style={styles.backText}>Groups</Text></Pressable>
      <View style={styles.groupHero}>
        <View style={styles.groupCopy}><Text style={styles.groupName}>{group.name}</Text><Text style={styles.groupMeta}>{group.members} members · {group.online} online</Text></View><Pressable disabled={saving} onPress={() => setInviteSheet(true)} style={styles.invite}><Ionicons name="person-add-outline" size={15} color={palette.accent} /><Text style={styles.inviteText}>Invite</Text></Pressable>
      </View>

      {voiceChannel ? <Pressable onPress={() => router.push(`/voice/${voiceChannel.id}`)}>
        <Card style={styles.voiceCard}>
          <View style={styles.voiceTop}><Text style={styles.voiceKicker}>●  LIVE</Text><Text style={styles.liveText}>{group.name}</Text></View><Text style={styles.voiceTitle}>{voiceChannel.name}</Text>
          <View style={styles.avatarStack}>{participants.slice(0, 4).map((person: any) => <Avatar key={person.id} person={person} size={36} showStatus={false} />)}<Text style={styles.capacity}>{participants.length} / 25</Text></View>
          <PrimaryButton label="Join room" onPress={() => router.push(`/voice/${voiceChannel.id}`)} />
        </Card>
      </Pressable> : null}

      <View>
        <SectionHeader title="Channels" action={canManage ? '+' : undefined} onAction={() => { setChannelKind('text'); setChannelSheet(true); }} />
        <Card style={styles.channelCard}>
          {textChannels.map((channel: any, index: number) => (
            <Pressable key={channel.id} onPress={() => router.push(`/channel/${channel.id}`)} style={[styles.channelRow, index > 0 && styles.rowBorder]}>
              <View style={styles.channelIcon}><Ionicons name="chatbubble-outline" size={16} color={palette.textMuted} /></View><Text style={styles.channelName}>{channel.name}</Text><Ionicons name="chevron-forward" size={17} color={palette.textSubtle} />
            </Pressable>
          ))}
          {!textChannels.length ? <QueryState empty="No text channels yet." /> : null}
        </Card>
      </View>

      <View>
        <SectionHeader title="Online now" action="See all" />
        <View style={styles.onlineList}>{people.filter((person: any) => person.status === 'online').map((person: any) => <Pressable key={person.id} onPress={() => router.push({ pathname: '/user/[userId]', params: { userId: person.id } })} style={styles.onlinePerson}><Avatar person={person} size={42} /><View style={styles.groupCopy}><Text style={styles.personName}>{person.name}</Text><Text style={styles.personActivity}>{person.activity}</Text></View><Ionicons name="chevron-forward" size={16} color={palette.textSubtle} /></Pressable>)}</View>
        {!people.some((person: any) => person.status === 'online') ? <QueryState empty="Nobody is online right now." /> : null}
      </View>
      <ActionSheet visible={channelSheet} onClose={() => setChannelSheet(false)} title="Create a channel" subtitle="Add a focused place for text or voice.">
        <Field label="Channel name" value={channelName} onChangeText={setChannelName} placeholder="game-night" autoCapitalize="none" autoCorrect={false} maxLength={40} />
        <View style={styles.kindRow}>{(['text', 'voice'] as const).map((kind) => <Pressable key={kind} onPress={() => setChannelKind(kind)} style={[styles.kindOption, channelKind === kind && styles.kindOptionActive]}><Ionicons name={kind === 'text' ? 'chatbubble-outline' : 'headset-outline'} size={18} color={channelKind === kind ? palette.white : palette.textMuted} /><Text style={[styles.kindText, channelKind === kind && styles.kindTextActive]}>{kind === 'text' ? 'Text' : 'Voice'}</Text></Pressable>)}</View>
        <PrimaryButton label={saving ? 'Creating…' : 'Create channel'} onPress={createChannel} />
      </ActionSheet>
      <ActionSheet visible={inviteSheet} onClose={() => setInviteSheet(false)} title="Invite to your group" subtitle="Friends can join with either the permanent link or code.">
        <View style={styles.inviteBlock}><View style={styles.inviteBlockTop}><Text style={styles.inviteBlockLabel}>INVITATION CODE</Text><Ionicons name="key-outline" size={17} color={palette.accent} /></View><Text selectable style={styles.inviteCode}>{inviteCode ?? 'Unavailable'}</Text><Pressable onPress={() => void shareInvite('code')} style={styles.shareRow}><Ionicons name="share-outline" size={16} color={palette.text} /><Text style={styles.shareText}>Share code</Text></Pressable></View>
        <View style={styles.inviteBlock}><View style={styles.inviteBlockTop}><Text style={styles.inviteBlockLabel}>INVITATION LINK</Text><Ionicons name="link-outline" size={17} color={palette.accentSoft} /></View><Text selectable numberOfLines={2} style={styles.inviteLink}>{inviteLink || 'Unavailable'}</Text><Pressable onPress={() => void shareInvite('link')} style={styles.shareRow}><Ionicons name="share-outline" size={16} color={palette.text} /><Text style={styles.shareText}>Share link</Text></Pressable></View>
        <PrimaryButton label="Share link and code" onPress={() => void shareInvite('both')} />
      </ActionSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  backRow: { height: 28, flexDirection: 'row', alignItems: 'center' }, backText: { color: palette.textMuted, fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8 },
  topBarSpacer: { width: 44 },
  groupHero: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 13 },
  groupIcon: { width: 58, height: 58, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  groupIconText: { color: palette.white, fontWeight: '900', fontSize: 17 },
  groupCopy: { flex: 1 },
  groupName: { color: palette.text, fontSize: 32, lineHeight: 42, fontWeight: '900' },
  groupMeta: { color: palette.textMuted, fontSize: 12, marginTop: 5 },
  invite: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: palette.surfaceSoft, borderWidth: 1, borderColor: palette.borderBright, borderRadius: Radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  inviteText: { color: palette.accentBright, fontWeight: '800', fontSize: 12 },
  voiceCard: { height: 196, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, overflow: 'hidden', padding: 20 },
  voiceGradient: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  voiceTop: { flexDirection: 'row', justifyContent: 'space-between' },
  voiceKicker: { color: palette.cyan, fontSize: 11, fontWeight: '800' },
  voiceTitle: { color: palette.text, fontSize: 26, lineHeight: 34, fontWeight: '900', marginTop: 12 },
  livePill: { height: 28, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, borderRadius: Radius.pill, backgroundColor: '#FFFFFFB8' },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.green },
  liveText: { color: palette.textMuted, fontSize: 11 },
  capacity: { color: palette.textMuted, fontSize: 12, marginLeft: 2 },
  voiceBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: 22 },
  avatarStack: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 12 },
  join: { color: palette.accentBright, fontWeight: '900', fontSize: 13 },
  channelCard: { padding: 0, backgroundColor: 'transparent' },
  channelRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, marginBottom: 8, borderRadius: 18, backgroundColor: palette.surface },
  rowBorder: { borderTopWidth: 1, borderTopColor: palette.border },
  channelIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: palette.surfaceSoft, alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  channelName: { color: palette.text, fontSize: 14, fontWeight: '700', flex: 1 },
  unread: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  unreadText: { color: palette.white, fontSize: 10, fontWeight: '900' },
  chevron: { color: palette.textMuted, fontSize: 22 },
  onlineList: { gap: 16 },
  onlinePerson: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  personName: { color: palette.text, fontSize: 14, fontWeight: '800' },
  personActivity: { color: palette.textMuted, fontSize: 11, marginTop: 3 },
  kindRow: { flexDirection: 'row', gap: 10 },
  kindOption: { flex: 1, height: 58, borderRadius: Radius.md, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  kindOptionActive: { backgroundColor: palette.accent, borderColor: palette.accentBright },
  kindText: { color: palette.textMuted, fontWeight: '700', fontSize: 13 },
  kindTextActive: { color: palette.white },
  inviteBlock: { borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.border, padding: 15, gap: 11 },
  inviteBlockTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, inviteBlockLabel: { color: palette.textMuted, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  inviteCode: { color: palette.text, fontSize: 19, fontWeight: '900', letterSpacing: .8 }, inviteLink: { color: palette.accentSoft, fontSize: 12, lineHeight: 18 },
  shareRow: { minHeight: 40, borderRadius: 13, backgroundColor: palette.surfaceRaised, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, shareText: { color: palette.text, fontSize: 11, fontWeight: '800' },
});
