import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ActionSheet, Field, Header, PrimaryButton, QueryState, Screen } from '@/components/ui/app-ui';
import { palette } from '@/constants/theme';
import { loadGroups } from '@/lib/app-data';
import { useSupabaseQuery } from '@/hooks/use-supabase-query';
import { useAuth } from '@/providers/auth-provider';
import { supabase } from '@/lib/supabase';

export default function GroupsScreen() {
  const { session } = useAuth();
  const [sheet, setSheet] = useState<'create' | 'join' | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [saving, setSaving] = useState(false);
  const query = useSupabaseQuery(() => session ? loadGroups(session.user.id) : Promise.resolve([]), [session?.user.id], []);
  const createGroup = async () => {
    if (!supabase || !session || !name.trim() || saving) return;
    setSaving(true);
    try {
      const { data: groupId, error } = await supabase.rpc('create_group_with_defaults', { requested_name: name.trim(), requested_description: description.trim() });
      if (error) throw error;
      if (!groupId) throw new Error('The group could not be created.');
      setName(''); setDescription(''); setSheet(null); await query.refresh(); router.push(`/group/${groupId}`);
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : typeof reason === 'object' && reason && 'message' in reason ? String(reason.message) : 'Please try again.';
      Alert.alert('Could not create group', message.includes('email') ? 'Please verify your email, then sign in again.' : message);
    }
    finally { setSaving(false); }
  };
  const joinGroup = async () => {
    if (!supabase || !inviteCode.trim() || saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('redeem_group_invite', { invite_code: inviteCode.trim() });
      if (error) throw error;
      setInviteCode(''); setSheet(null); await query.refresh();
      if (data) router.push(`/group/${data}`);
    } catch (reason) { Alert.alert('Could not join group', reason instanceof Error ? reason.message : 'Check the invite code and try again.'); }
    finally { setSaving(false); }
  };
  return (
    <Screen>
      <Header title="Groups" />
      <Pressable onPress={() => setSheet('join')} style={styles.joinCard}><Ionicons name="add" size={27} color={palette.accent} /><View style={styles.joinCopy}><Text style={styles.joinTitle}>Join a group</Text><Text style={styles.joinBody}>Enter an invite code</Text></View><Ionicons name="arrow-forward" size={23} color={palette.textMuted} /></Pressable>
      {query.loading || query.error ? <QueryState loading={query.loading} error={query.error} onRetry={query.refresh} /> : null}
      <View style={styles.groupList}>
        {query.data.map((group) => (
          <Pressable key={group.id} onPress={() => router.push(`/group/${group.id}`)} style={({ pressed }) => [styles.groupCard, pressed && styles.pressed]}>
              <Ionicons name="grid-outline" size={24} color={group.color || palette.accent} />
              <Text style={styles.groupName}>{group.name}</Text><Text style={styles.memberCount}>{group.members} members</Text><Text style={styles.online}>● {group.online} online</Text><Text style={styles.lastMessage} numberOfLines={1}>{group.lastMessage}</Text>
          </Pressable>
        ))}
      </View>
      {!query.loading && !query.error && !query.data.length ? <QueryState empty="No groups yet. Create one or join with an invite." /> : null}
      <PrimaryButton label="Create group" onPress={() => setSheet('create')} />
      <ActionSheet visible={sheet === 'create'} onClose={() => setSheet(null)} title="Create your group" subtitle="A private space with text and voice rooms, ready immediately.">
        <Field label="Group name" value={name} onChangeText={setName} placeholder="Weekend crew" maxLength={80} autoFocus />
        <Field label="Description" value={description} onChangeText={setDescription} placeholder="What brings everyone together?" maxLength={500} multiline />
        <PrimaryButton label={saving ? 'Creating…' : 'Create group'} onPress={createGroup} />
      </ActionSheet>
      <ActionSheet visible={sheet === 'join'} onClose={() => setSheet(null)} title="Join a group" subtitle="Paste the invite code a friend shared with you.">
        <Field label="Invite code" value={inviteCode} onChangeText={setInviteCode} placeholder="Enter invite code" autoCapitalize="none" autoCorrect={false} autoFocus />
        <PrimaryButton label={saving ? 'Joining…' : 'Join group'} onPress={joinGroup} />
      </ActionSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  joinCard: { height: 78, backgroundColor: palette.surface, borderRadius: 18, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }, joinCopy: { flex: 1, gap: 4 }, joinTitle: { color: palette.text, fontSize: 15, fontWeight: '700' }, joinBody: { color: palette.textMuted, fontSize: 12 },
  groupList: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, groupCard: { width: '48%', height: 198, backgroundColor: palette.surface, borderRadius: 18, padding: 16, alignItems: 'flex-start' }, groupName: { color: palette.text, fontWeight: '800', fontSize: 17, marginTop: 12 }, memberCount: { color: palette.textMuted, fontSize: 12, marginTop: 12 }, online: { color: palette.cyan, fontSize: 11, marginTop: 10 }, lastMessage: { color: palette.textMuted, fontSize: 11, marginTop: 10, width: '100%' }, pressed: { opacity: .72, transform: [{ scale: .985 }] },
});
