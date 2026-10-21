import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInRight, LinearTransition } from 'react-native-reanimated';

import { Avatar, IconButton, QueryState, Screen } from '@/components/ui/app-ui';
import { palette } from '@/constants/theme';
import { AppNotification, loadNotifications, relativeTime } from '@/lib/app-data';
import { supabase } from '@/lib/supabase';
import { useSupabaseQuery } from '@/hooks/use-supabase-query';
import { useAuth } from '@/providers/auth-provider';

const notificationIcons: Record<string, React.ComponentProps<typeof Ionicons>['name']> = {
  direct_message: 'chatbubble-ellipses', mention: 'at', reaction: 'heart', friend_request: 'person-add',
  group_invite: 'people', voice_ping: 'headset', event_reminder: 'calendar', moderation: 'shield-checkmark',
};

function destination(item: AppNotification) {
  if (!item.entity_id) return null;
  if (item.entity_type === 'group') return `/group/${item.entity_id}` as const;
  if (item.entity_type === 'profile') return `/channel/dm-${item.entity_id}` as const;
  if (item.entity_type === 'channel' || item.entity_type === 'message') return `/channel/${item.entity_id}` as const;
  if (item.entity_type === 'event') return '/events' as const;
  return null;
}

export default function NotificationsScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const query = useSupabaseQuery(() => userId ? loadNotifications(userId) : Promise.resolve([]), [userId], [] as AppNotification[]);
  const refresh = query.refresh;

  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase.channel(`notifications:${userId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => void refresh()).subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [refresh, userId]);

  const markRead = async (item: AppNotification) => {
    if (!supabase || item.read_at) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', item.id);
    query.setData(query.data.map((row) => row.id === item.id ? { ...row, read_at: new Date().toISOString() } : row));
  };

  const open = async (item: AppNotification) => {
    await markRead(item);
    const route = destination(item);
    if (route) router.push(route);
  };

  const markAllRead = async () => {
    if (!supabase || !userId) return;
    const now = new Date().toISOString();
    const { error } = await supabase.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null);
    if (!error) query.setData(query.data.map((item) => ({ ...item, read_at: item.read_at ?? now })));
  };

  const unread = query.data.filter((item) => !item.read_at).length;
  return <Screen>
    <View style={styles.header}><IconButton label="‹" onPress={() => router.back()} /><View style={styles.headerCopy}><Text style={styles.eyebrow}>{unread ? `${unread} NEW` : 'ALL CAUGHT UP'}</Text><Text style={styles.title}>Notifications</Text></View>{unread ? <Pressable onPress={markAllRead}><Text style={styles.markAll}>Mark all read</Text></Pressable> : <View style={styles.headerSpacer} />}</View>
    {query.loading || query.error ? <QueryState loading={query.loading} error={query.error} onRetry={query.refresh} /> : null}
    {!query.loading && !query.data.length ? <View style={styles.empty}><View style={styles.emptyIcon}><Ionicons name="sparkles" size={27} color={palette.accent} /></View><Text style={styles.emptyTitle}>You’re all caught up</Text><Text style={styles.emptyCopy}>Messages, invitations, voice pings and event reminders will appear here.</Text></View> : null}
    <View style={styles.list}>{query.data.map((item, index) => <Animated.View key={item.id} entering={FadeInRight.delay(Math.min(index * 35, 280))} layout={LinearTransition}>
      <Pressable onPress={() => void open(item)} style={({ pressed }) => [styles.row, !item.read_at && styles.rowUnread, pressed && styles.pressed]}>
        {item.actor ? <Avatar person={item.actor} size={44} showStatus={false} /> : <View style={styles.icon}><Ionicons name={notificationIcons[item.type] ?? 'notifications'} size={20} color={palette.accent} /></View>}
        <View style={styles.copy}><View style={styles.rowTop}><Text numberOfLines={1} style={styles.rowTitle}>{item.title}</Text><Text style={styles.time}>{relativeTime(item.created_at)}</Text></View>{item.body ? <Text numberOfLines={2} style={styles.body}>{item.body}</Text> : null}</View>
        {!item.read_at ? <View style={styles.unreadDot} /> : null}
      </Pressable>
    </Animated.View>)}</View>
  </Screen>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: -10, gap: 8 }, headerCopy: { flex: 1 }, headerSpacer: { width: 78 }, eyebrow: { color: palette.accentSoft, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 }, title: { color: palette.text, fontSize: 28, fontWeight: '900', letterSpacing: -.6 }, markAll: { color: palette.accent, fontSize: 11, fontWeight: '800', padding: 10 },
  list: { gap: 8 }, row: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13, borderRadius: 18, backgroundColor: palette.surface }, rowUnread: { backgroundColor: palette.surfaceAccent, borderWidth: 1, borderColor: palette.borderBright }, icon: { width: 44, height: 44, borderRadius: 16, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, copy: { flex: 1, gap: 5 }, rowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 }, rowTitle: { flex: 1, color: palette.text, fontSize: 13, fontWeight: '800' }, time: { color: palette.textSubtle, fontSize: 9 }, body: { color: palette.textMuted, fontSize: 11, lineHeight: 16 }, unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.accent },
  empty: { minHeight: 330, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }, emptyIcon: { width: 64, height: 64, borderRadius: 24, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center', marginBottom: 18 }, emptyTitle: { color: palette.text, fontSize: 19, fontWeight: '900' }, emptyCopy: { color: palette.textMuted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 8 }, pressed: { opacity: .7, transform: [{ scale: .99 }] },
});
