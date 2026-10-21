import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ActionSheet, Avatar, Card, Field, Header, PrimaryButton, QueryState, Screen } from '@/components/ui/app-ui';
import { palette, Radius } from '@/constants/theme';
import { loadFriends, Person, Profile, toPerson } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/use-supabase-query';
import { useAuth } from '@/providers/auth-provider';

export default function FriendsScreen() {
  const { session } = useAuth();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'online' | 'requests'>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [friendQuery, setFriendQuery] = useState('');
  const [suggestions, setSuggestions] = useState<(Person & { relationship: string | null; direction: string | null })[]>([]);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [suggestionError, setSuggestionError] = useState<string | null>(null);
  const query = useSupabaseQuery(() => session ? loadFriends(session.user.id) : Promise.resolve({ people: [], pending: 0, requests: [] }), [session?.user.id], { people: [], pending: 0, requests: [] });
  const visible = useMemo(() => query.data.people.filter((person) => (filter !== 'online' || person.status === 'online') && `${person.name} ${person.handle}`.toLowerCase().includes(search.trim().toLowerCase())), [query.data.people, search, filter]);
  const online = query.data.people.filter((person) => person.status === 'online').length;

  useEffect(() => {
    const term = friendQuery.trim().replace(/^@/, '').replace(/[^a-zA-Z0-9_ ]/g, '').toLowerCase();
    if (!addOpen || term.length < 2 || !supabase || !session) { setSuggestions([]); setSearching(false); setSuggestionError(null); return; }
    const client = supabase;
    let current = true;
    setSearching(true); setSuggestionError(null);
    const timer = setTimeout(async () => {
      const { data, error } = await client.rpc('search_people', { search_text: term, result_limit: 8 });
      if (!current) return;
      setSearching(false);
      if (error) { setSuggestions([]); setSuggestionError(error.message); return; }
      setSuggestions((data ?? []).map((row: any) => ({
        ...toPerson({ id: row.id, username: row.username, display_name: row.display_name, avatar_path: row.avatar_path, status: row.status, bio: '', favorite_games: [], interests: [], last_seen_at: null } as Profile),
        relationship: row.relationship_status,
        direction: row.request_direction,
      })));
    }, 280);
    return () => { current = false; clearTimeout(timer); };
  }, [addOpen, friendQuery, session]);

  const sendRequest = async (person: Person) => {
    if (!supabase || !session || sendingId) return;
    setSendingId(person.id);
    const { error } = await supabase.from('friendships').insert({ requester_id: session.user.id, addressee_id: person.id });
    setSendingId(null);
    if (error) Alert.alert('Could not send request', error.message);
    else {
      setSuggestions((items) => items.map((item) => item.id === person.id ? { ...item, relationship: 'pending', direction: 'outgoing' } : item));
      await query.refresh();
    }
  };

  const answerRequest = async (requesterId: string, addresseeId: string, status: 'accepted' | 'declined') => {
    if (!supabase) return;
    const { error } = await supabase.from('friendships').update({ status, updated_at: new Date().toISOString() }).eq('requester_id', requesterId).eq('addressee_id', addresseeId);
    if (error) Alert.alert('Could not update request', error.message); else await query.refresh();
  };

  return <Screen>
    <Header title="Friends" />
    <View style={styles.search}><Ionicons name="search" size={19} color={palette.textMuted} /><TextInput value={search} onChangeText={setSearch} placeholder="Search friends" placeholderTextColor={palette.textSubtle} style={styles.input} />{search ? <Pressable onPress={() => setSearch('')}><Ionicons name="close-circle" size={18} color={palette.textMuted} /></Pressable> : null}</View>
    <View style={styles.chips}>{([{ key: 'all', label: `All ${query.data.people.length}` }, { key: 'online', label: `Online ${online}` }, { key: 'requests', label: `Requests ${query.data.pending}` }] as const).map((item) => <Pressable onPress={() => setFilter(item.key)} key={item.key} style={[styles.chip, filter === item.key && styles.chipActive]}><Text style={[styles.chipText, filter === item.key && styles.chipTextActive]}>{item.label}</Text></Pressable>)}</View>
    {query.loading || query.error ? <QueryState loading={query.loading} error={query.error} onRetry={query.refresh} /> : null}
    {filter !== 'requests' ? <View style={styles.list}>{visible.map((person) => <Pressable key={person.id} onPress={() => router.push({ pathname: '/user/[userId]', params: { userId: person.id } })}><Card style={styles.personRow}><Avatar person={person} /><View style={styles.copy}><Text style={styles.name}>{person.name}</Text><Text style={styles.activity}>{person.activity ?? person.handle}</Text></View><Ionicons name="chevron-forward" size={17} color={palette.textSubtle} /></Card></Pressable>)}</View> : <View style={styles.list}>{query.data.requests.map((request) => <Card key={`${request.requesterId}-${request.addresseeId}`} style={styles.personRow}><Pressable onPress={() => router.push({ pathname: '/user/[userId]', params: { userId: request.person.id } })}><Avatar person={request.person} /></Pressable><View style={styles.copy}><Text style={styles.name}>{request.person.name}</Text><Text style={styles.activity}>{request.incoming ? 'Wants to be your friend' : 'Request sent'}</Text></View>{request.incoming ? <View style={styles.requestActions}><Pressable onPress={() => answerRequest(request.requesterId, request.addresseeId, 'accepted')} style={styles.accept}><Ionicons name="checkmark" size={18} color={palette.canvas} /></Pressable><Pressable onPress={() => answerRequest(request.requesterId, request.addresseeId, 'declined')} style={styles.decline}><Ionicons name="close" size={18} color={palette.textMuted} /></Pressable></View> : <View style={styles.pending}><Text style={styles.pendingText}>Pending</Text></View>}</Card>)}</View>}
    {!query.loading && !query.error && filter !== 'requests' && !visible.length ? <QueryState empty={search ? 'No friends match your search.' : filter === 'online' ? 'No friends are online right now.' : 'Your accepted friends will appear here.'} /> : null}
    {!query.loading && !query.error && filter === 'requests' && !query.data.requests.length ? <QueryState empty="You have no pending friend requests." /> : null}
    <PrimaryButton label="Add friend" tone="quiet" onPress={() => setAddOpen(true)} />
    <ActionSheet visible={addOpen} onClose={() => { setAddOpen(false); setFriendQuery(''); setSuggestions([]); }} title="Find your people" subtitle="Start typing a username or display name. Suggestions appear automatically.">
      <Field label="Username or name" value={friendQuery} onChangeText={setFriendQuery} placeholder="Try @alex or Alex Khan" autoCapitalize="none" autoCorrect={false} autoFocus />
      {friendQuery.trim().replace(/^@/, '').length < 2 ? <View style={styles.searchHint}><Ionicons name="sparkles-outline" size={16} color={palette.accentSoft} /><Text style={styles.searchHintText}>Type at least 2 characters</Text></View> : null}
      {searching ? <QueryState loading /> : null}
      {suggestionError ? <QueryState error={suggestionError} /> : null}
      {!searching && friendQuery.trim().replace(/^@/, '').length >= 2 && !suggestionError && !suggestions.length ? <QueryState empty="No matching people found." /> : null}
      <View style={styles.suggestionList}>{suggestions.map((person) => <View key={person.id} style={styles.suggestionRow}><Pressable onPress={() => { setAddOpen(false); router.push({ pathname: '/user/[userId]', params: { userId: person.id } }); }}><Avatar person={person} size={44} /></Pressable><Pressable onPress={() => { setAddOpen(false); router.push({ pathname: '/user/[userId]', params: { userId: person.id } }); }} style={styles.copy}><Text style={styles.name}>{person.name}</Text><Text style={styles.activity}>{person.handle}</Text></Pressable>{person.relationship === 'accepted' ? <View style={styles.relationshipPill}><Ionicons name="checkmark" size={13} color={palette.accentSoft} /><Text style={styles.relationshipText}>Friends</Text></View> : person.relationship === 'pending' ? <View style={styles.relationshipPill}><Text style={styles.relationshipText}>{person.direction === 'incoming' ? 'Requested you' : 'Pending'}</Text></View> : <Pressable disabled={Boolean(sendingId)} onPress={() => void sendRequest(person)} style={[styles.sendRequest, sendingId === person.id && styles.disabled]}><Ionicons name="person-add" size={16} color={palette.canvas} /><Text style={styles.sendRequestText}>{sendingId === person.id ? 'Sending' : 'Add'}</Text></Pressable>}</View>)}</View>
    </ActionSheet>
  </Screen>;
}

const styles = StyleSheet.create({
  search: { height: 48, borderRadius: 18, backgroundColor: palette.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 10 }, input: { flex: 1, color: palette.text, fontSize: 14 }, chips: { flexDirection: 'row', gap: 8 }, chip: { paddingHorizontal: 24, height: 38, justifyContent: 'center', borderRadius: Radius.pill, backgroundColor: palette.surface }, chipActive: { backgroundColor: palette.accent }, chipText: { color: palette.textMuted, fontWeight: '700', fontSize: 13 }, chipTextActive: { color: palette.canvas }, list: { gap: 6 }, personRow: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 13, padding: 0, borderRadius: 0, backgroundColor: 'transparent' }, copy: { flex: 1, gap: 5 }, name: { color: palette.text, fontWeight: '800', fontSize: 15 }, activity: { color: palette.textMuted, fontSize: 12 }, presence: { width: 7, height: 7, borderRadius: 4, marginRight: 18 }, requestActions: { flexDirection: 'row', gap: 7 }, accept: { width: 36, height: 36, borderRadius: 12, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }, decline: { width: 36, height: 36, borderRadius: 12, backgroundColor: palette.surfaceSoft, alignItems: 'center', justifyContent: 'center' }, pending: { backgroundColor: palette.surfaceSoft, paddingHorizontal: 11, paddingVertical: 7, borderRadius: Radius.pill }, pendingText: { color: palette.textMuted, fontSize: 10, fontWeight: '700' }, sendRequest: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: Radius.pill, backgroundColor: palette.accent, paddingHorizontal: 13, paddingVertical: 9 }, sendRequestText: { color: palette.canvas, fontSize: 11, fontWeight: '800' },
  searchHint: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 4 }, searchHintText: { color: palette.textMuted, fontSize: 11 }, suggestionList: { gap: 4 }, suggestionRow: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: palette.border }, relationshipPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: palette.surfaceRaised, paddingHorizontal: 10, paddingVertical: 7, borderRadius: Radius.pill }, relationshipText: { color: palette.textMuted, fontSize: 10, fontWeight: '800' }, disabled: { opacity: .55 },
});
