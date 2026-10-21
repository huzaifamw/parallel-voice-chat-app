import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { ActionSheet, Field, IconButton, PrimaryButton, QueryState, Screen } from '@/components/ui/app-ui';
import { palette } from '@/constants/theme';
import { AppGroup, eventDate, loadGroups, loadUpcomingEvents, ScheduledEvent } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/use-supabase-query';
import { useAuth } from '@/providers/auth-provider';

type Preset = 'tonight' | 'tomorrow' | 'weekend';

function presetDate(preset: Preset) {
  const value = new Date();
  if (preset === 'tonight') value.setHours(20, 0, 0, 0);
  if (preset === 'tomorrow') { value.setDate(value.getDate() + 1); value.setHours(19, 0, 0, 0); }
  if (preset === 'weekend') { const days = (6 - value.getDay() + 7) % 7 || 7; value.setDate(value.getDate() + days); value.setHours(20, 0, 0, 0); }
  return value;
}

export default function EventsScreen() {
  const params = useLocalSearchParams<{ groupId?: string }>();
  const { session } = useAuth();
  const userId = session?.user.id;
  const query = useSupabaseQuery(async () => {
    if (!userId) return { groups: [] as AppGroup[], events: [] as ScheduledEvent[] };
    const [groups, events] = await Promise.all([loadGroups(userId), loadUpcomingEvents(userId, params.groupId)]);
    return { groups, events };
  }, [userId, params.groupId], { groups: [], events: [] });
  const [sheet, setSheet] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [groupId, setGroupId] = useState(params.groupId ?? '');
  const [preset, setPreset] = useState<Preset>('tomorrow');
  const [saving, setSaving] = useState(false);
  const selectedGroup = useMemo(() => groupId || query.data.groups[0]?.id || '', [groupId, query.data.groups]);

  const rsvp = async (event: ScheduledEvent, response: ScheduledEvent['response']) => {
    if (!supabase || !userId || !response) return;
    void Haptics.selectionAsync();
    const { error } = await supabase.from('event_attendees').upsert({ event_id: event.id, user_id: userId, response }, { onConflict: 'event_id,user_id' });
    if (error) Alert.alert('Could not update RSVP', error.message); else await query.refresh();
  };

  const createEvent = async () => {
    if (!supabase || !userId || !title.trim() || !selectedGroup || saving) return;
    setSaving(true);
    const start = presetDate(preset);
    const { error } = await supabase.from('scheduled_events').insert({ group_id: selectedGroup, created_by: userId, title: title.trim(), description: description.trim(), starts_at: start.toISOString() });
    setSaving(false);
    if (error) return Alert.alert('Could not schedule event', error.message);
    setTitle(''); setDescription(''); setSheet(false); await query.refresh();
  };

  return <Screen>
    <View style={styles.header}><IconButton label="‹" onPress={() => router.back()} /><View style={styles.headerCopy}><Text style={styles.eyebrow}>MAKE TIME TOGETHER</Text><Text style={styles.title}>Events</Text></View><Pressable onPress={() => setSheet(true)} style={styles.create}><Ionicons name="add" size={21} color={palette.canvas} /></Pressable></View>
    <View style={styles.hero}><View><Text style={styles.heroEyebrow}>UPCOMING</Text><Text style={styles.heroNumber}>{query.data.events.length}</Text><Text style={styles.heroLabel}>plans across your circles</Text></View><View style={styles.heroOrb}><Ionicons name="calendar" size={32} color={palette.accent} /></View></View>
    {query.loading || query.error ? <QueryState loading={query.loading} error={query.error} onRetry={query.refresh} /> : null}
    {!query.loading && !query.data.events.length ? <QueryState empty="No plans yet. Schedule a game night, study session or voice hangout." /> : null}
    <View style={styles.list}>{query.data.events.map((event, index) => <Animated.View key={event.id} entering={FadeInDown.delay(index * 45)} style={styles.eventCard}>
      <View style={styles.dateBlock}><Text style={styles.dateDay}>{new Date(event.starts_at).toLocaleDateString(undefined, { day: '2-digit' })}</Text><Text style={styles.dateMonth}>{new Date(event.starts_at).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</Text></View>
      <View style={styles.eventCopy}><Text style={styles.group}>{event.groupName}</Text><Text style={styles.eventTitle}>{event.title}</Text><Text style={styles.eventMeta}>{eventDate(event.starts_at)} · {event.going} going</Text>{event.description ? <Text numberOfLines={2} style={styles.description}>{event.description}</Text> : null}
        <View style={styles.rsvpRow}>{(['going', 'interested'] as const).map((response) => <Pressable key={response} onPress={() => void rsvp(event, response)} style={[styles.rsvp, event.response === response && styles.rsvpActive]}><Text style={[styles.rsvpText, event.response === response && styles.rsvpTextActive]}>{response === 'going' ? 'Going' : 'Interested'}</Text></Pressable>)}</View>
      </View>
    </Animated.View>)}</View>
    <ActionSheet visible={sheet} onClose={() => setSheet(false)} title="Schedule a hangout" subtitle="Create a plan everyone in your group can RSVP to.">
      <Field label="Event name" value={title} onChangeText={setTitle} placeholder="Friday game night" maxLength={120} />
      <Field label="Description (optional)" value={description} onChangeText={setDescription} placeholder="What should everyone know?" multiline maxLength={1000} />
      <View><Text style={styles.fieldLabel}>Group</Text><View style={styles.chips}>{query.data.groups.map((group) => <Pressable key={group.id} onPress={() => setGroupId(group.id)} style={[styles.chip, selectedGroup === group.id && styles.chipActive]}><Text style={[styles.chipText, selectedGroup === group.id && styles.chipTextActive]}>{group.name}</Text></Pressable>)}</View></View>
      <View><Text style={styles.fieldLabel}>When</Text><View style={styles.chips}>{(['tonight', 'tomorrow', 'weekend'] as Preset[]).map((item) => <Pressable key={item} onPress={() => setPreset(item)} style={[styles.chip, preset === item && styles.chipActive]}><Text style={[styles.chipText, preset === item && styles.chipTextActive]}>{item === 'weekend' ? 'This weekend' : item[0].toUpperCase() + item.slice(1)}</Text></Pressable>)}</View></View>
      <PrimaryButton label={saving ? 'Scheduling…' : 'Schedule event'} onPress={() => void createEvent()} />
    </ActionSheet>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -10, gap: 8 }, headerCopy: { flex: 1 }, eyebrow: { color: palette.accentSoft, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }, title: { color: palette.text, fontSize: 28, fontWeight: '900', letterSpacing: -.6 }, create: { width: 44, height: 44, borderRadius: 16, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' },
  hero: { minHeight: 142, borderRadius: 24, backgroundColor: palette.surfaceAccent, borderWidth: 1, borderColor: palette.border, padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, heroEyebrow: { color: palette.accentSoft, fontSize: 9, fontWeight: '800', letterSpacing: 1.3 }, heroNumber: { color: palette.text, fontSize: 42, fontWeight: '900', marginTop: 3 }, heroLabel: { color: palette.textMuted, fontSize: 12 }, heroOrb: { width: 70, height: 70, borderRadius: 28, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '6deg' }] },
  list: { gap: 12 }, eventCard: { flexDirection: 'row', gap: 14, borderRadius: 20, padding: 15, backgroundColor: palette.surface }, dateBlock: { width: 52, height: 59, borderRadius: 16, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, dateDay: { color: palette.text, fontSize: 21, fontWeight: '900' }, dateMonth: { color: palette.accent, fontSize: 9, fontWeight: '900' }, eventCopy: { flex: 1 }, group: { color: palette.accentSoft, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: .8 }, eventTitle: { color: palette.text, fontSize: 16, fontWeight: '900', marginTop: 3 }, eventMeta: { color: palette.textMuted, fontSize: 10, marginTop: 5 }, description: { color: palette.textMuted, fontSize: 11, lineHeight: 16, marginTop: 8 }, rsvpRow: { flexDirection: 'row', gap: 7, marginTop: 12 }, rsvp: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 12, backgroundColor: palette.surfaceRaised }, rsvpActive: { backgroundColor: palette.accent }, rsvpText: { color: palette.textMuted, fontSize: 10, fontWeight: '800' }, rsvpTextActive: { color: palette.canvas },
  fieldLabel: { color: palette.text, fontSize: 12, fontWeight: '700', marginBottom: 8 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 38, borderRadius: 13, paddingHorizontal: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surfaceRaised, borderWidth: 1, borderColor: palette.border }, chipActive: { backgroundColor: palette.accent, borderColor: palette.accent }, chipText: { color: palette.textMuted, fontSize: 11, fontWeight: '700' }, chipTextActive: { color: palette.canvas },
});
