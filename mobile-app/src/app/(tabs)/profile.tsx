import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { ActionSheet, Avatar, Card, Field, Header, PrimaryButton, QueryState, Screen } from '@/components/ui/app-ui';
import { palette } from '@/constants/theme';
import { loadProfile, toPerson } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/use-supabase-query';
import { useAuth } from '@/providers/auth-provider';

function SettingRow({ label, value, toggle, onToggle }: { label: string; value?: string; toggle?: boolean; onToggle?: (value: boolean) => void }) {
  const icons: Record<string, React.ComponentProps<typeof Ionicons>['name']> = { 'Appear invisible': 'eye-off-outline', 'Show activity': 'pulse-outline', 'Direct messages': 'chatbubbles-outline', Notifications: 'notifications-outline', 'Voice & audio': 'headset-outline', 'Safety center': 'shield-checkmark-outline' };
  return <View style={styles.settingRow}><View style={styles.settingIcon}><Ionicons name={icons[label] ?? 'settings-outline'} size={17} color={palette.accentSoft} /></View><Text style={styles.settingLabel}>{label}</Text>{onToggle ? <Switch value={toggle} onValueChange={onToggle} trackColor={{ false: palette.surfaceSoft, true: palette.accent }} thumbColor={palette.white} /> : <View style={styles.valueWrap}><Text style={styles.settingValue}>{value}</Text></View>}</View>;
}

export default function ProfileScreen() {
  const { configured, session, signOut } = useAuth();
  const [invisible, setInvisible] = useState(false);
  const [activity, setActivity] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [interests, setInterests] = useState('');
  const [saving, setSaving] = useState(false);
  const query = useSupabaseQuery(async () => {
    if (!session || !supabase) return { profile: null, preferences: null };
    const [profile, preferencesResult] = await Promise.all([
      loadProfile(session.user.id),
      supabase.from('user_preferences').select('*').eq('user_id', session.user.id).single(),
    ]);
    if (preferencesResult.error) throw preferencesResult.error;
    return { profile, preferences: preferencesResult.data };
  }, [session?.user.id], { profile: null, preferences: null } as any);
  useEffect(() => {
    if (!query.data.profile) return;
    setInvisible(query.data.profile.status === 'invisible');
    setActivity(query.data.preferences?.show_activity ?? true);
    setDisplayName(query.data.profile.display_name);
    setBio(query.data.profile.bio);
    setInterests(query.data.profile.interests.join(', '));
  }, [query.data]);
  const profile = query.data.profile;
  const updateStatus = async (value: boolean) => {
    setInvisible(value);
    if (!supabase || !session) return;
    const { error } = await supabase.from('profiles').update({ status: value ? 'invisible' : 'online', last_seen_at: new Date().toISOString() }).eq('id', session.user.id);
    if (error) { setInvisible(!value); Alert.alert('Could not update status', error.message); }
  };
  const updateActivity = async (value: boolean) => {
    setActivity(value);
    if (!supabase || !session) return;
    const { error } = await supabase.from('user_preferences').update({ show_activity: value, updated_at: new Date().toISOString() }).eq('user_id', session.user.id);
    if (error) { setActivity(!value); Alert.alert('Could not update preference', error.message); }
  };
  const handleSignOut = async () => {
    try { await signOut(); } catch (error) { Alert.alert('Could not sign out', error instanceof Error ? error.message : 'Please try again.'); }
  };
  const saveProfile = async () => {
    if (!supabase || !session || !displayName.trim() || saving) return;
    setSaving(true);
    const { error } = await supabase.from('profiles').update({ display_name: displayName.trim(), bio: bio.trim(), interests: interests.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 10), updated_at: new Date().toISOString() }).eq('id', session.user.id);
    setSaving(false);
    if (error) Alert.alert('Could not update profile', error.message); else { setEditOpen(false); await query.refresh(); }
  };
  return (
    <Screen>
      <Header title="Profile" />
      {query.loading || query.error ? <QueryState loading={query.loading} error={query.error} onRetry={query.refresh} /> : null}
      {profile ? <>
      <Card style={styles.profileCard}>
        <View style={styles.profileMain}><View style={styles.avatarLift}><Avatar person={toPerson(profile)} size={82} /></View><View style={styles.identity}><Text style={styles.name}>{profile.display_name}</Text><Text style={styles.handle}>@{profile.username}</Text><View style={styles.statusBadge}><View style={styles.statusDot} /><Text style={styles.statusText}>{invisible ? 'Invisible' : 'Available'}</Text></View></View></View>
        {profile.bio ? <Text style={styles.profileBio}>{profile.bio}</Text> : null}
        {profile.interests.length || profile.favorite_games.length ? <View style={styles.interestWrap}>{[...profile.favorite_games, ...profile.interests].slice(0, 5).map((item) => <View key={item} style={styles.interestChip}><Text numberOfLines={1} style={styles.interestChipText}>{item}</Text></View>)}</View> : null}
      </Card>
      <PrimaryButton label="Edit profile" tone="quiet" onPress={() => setEditOpen(true)} />
      <Card style={styles.settings}>
        <Text style={styles.cardLabel}>PRIVACY</Text>
        <SettingRow label="Appear invisible" toggle={invisible} onToggle={updateStatus} />
        <SettingRow label="Show activity" toggle={activity} onToggle={updateActivity} />
        <SettingRow label="Direct messages" value={query.data.preferences?.dm_privacy === 'friends' ? 'Friends' : query.data.preferences?.dm_privacy === 'nobody' ? 'Nobody' : 'Friends & shared groups'} />
      </Card>
      <Card style={styles.settings}>
        <Text style={styles.cardLabel}>PREFERENCES</Text>
        <SettingRow label="Notifications" value={query.data.preferences?.notify_direct_messages || query.data.preferences?.notify_mentions || query.data.preferences?.notify_group_messages ? 'On' : 'Off'} />
        <SettingRow label="Voice & audio" value="Default" />
        <SettingRow label="Safety center" value="" />
      </Card>
      </> : null}
      <View style={styles.backendState}><View style={[styles.backendDot, { backgroundColor: configured ? palette.green : palette.amber }]} /><Text style={styles.backendText}>{configured ? `Connected to Supabase${session?.user.email ? ` as ${session.user.email}` : ''}` : 'Supabase credentials not added'}</Text></View>
      {configured && session ? <Pressable onPress={handleSignOut} style={styles.signOut}><Text style={styles.signOutText}>Sign out</Text></Pressable> : null}
      <Text style={styles.version}>Parallel · Version 1.0</Text>
      <ActionSheet visible={editOpen} onClose={() => setEditOpen(false)} title="Edit profile" subtitle="Make your profile feel like you.">
        <Field label="Display name" value={displayName} onChangeText={setDisplayName} maxLength={40} placeholder="Your name" />
        <Field label="Bio" value={bio} onChangeText={setBio} maxLength={240} multiline placeholder="A little about you" />
        <Field label="Interests" value={interests} onChangeText={setInterests} placeholder="Gaming, music, study" />
        <PrimaryButton label={saving ? 'Saving…' : 'Save profile'} onPress={saveProfile} />
      </ActionSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profileCard: { minHeight: 164, padding: 20, borderColor: palette.borderBright },
  profileCover: { height: 112, width: '100%' },
  profileMain: { flexDirection: 'row', alignItems: 'center', gap: 16 }, avatarLift: { borderRadius: 44, flexShrink: 0 }, identity: { flex: 1, minWidth: 0 },
  name: { color: palette.text, fontSize: 23, lineHeight: 29, fontWeight: '800', letterSpacing: -.4, flexShrink: 1 },
  handle: { color: palette.textMuted, fontSize: 12, marginTop: 2 }, statusBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, backgroundColor: palette.surfaceSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 }, statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: palette.green }, statusText: { color: palette.textMuted, fontSize: 9, fontWeight: '700' },
  profileBio: { color: palette.textMuted, fontSize: 12, lineHeight: 18, marginTop: 16 },
  interestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 14 },
  interestChip: { maxWidth: '100%', backgroundColor: palette.surfaceRaised, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  interestChipText: { color: palette.accentSoft, fontSize: 10, fontWeight: '700' },
  bio: { color: palette.textMuted, fontSize: 13, lineHeight: 19, marginTop: 18, paddingHorizontal: 18 }, bioEmpty: { color: palette.textSubtle, fontSize: 12, fontStyle: 'italic', marginTop: 18, paddingHorizontal: 18 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16, paddingHorizontal: 18 },
  tag: { color: palette.accent, backgroundColor: palette.surfaceAccent, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, fontSize: 11, fontWeight: '800' },
  settings: { paddingVertical: 8, borderColor: palette.borderBright },
  cardLabel: { color: palette.textMuted, fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginHorizontal: 7, marginVertical: 10 },
  settingRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: palette.border, paddingHorizontal: 7, gap: 11 },
  settingIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: palette.surfaceAccent, alignItems: 'center', justifyContent: 'center' },
  settingLabel: { color: palette.text, fontSize: 14, fontWeight: '600', flex: 1 },
  settingValue: { color: palette.textMuted, fontSize: 12, textAlign: 'right', flexShrink: 1 },
  valueWrap: { maxWidth: '55%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  backendState: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 7 },
  backendDot: { width: 7, height: 7, borderRadius: 4 },
  backendText: { color: palette.textMuted, fontSize: 10, flexShrink: 1 },
  signOut: { minHeight: 50, borderRadius: 16, borderWidth: 1, borderColor: '#F0C5C7', backgroundColor: '#FFF2F2', alignItems: 'center', justifyContent: 'center' },
  signOutText: { color: palette.red, fontWeight: '900', fontSize: 13 },
  version: { color: palette.textMuted, textAlign: 'center', fontSize: 11 },
});
