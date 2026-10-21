import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { Avatar, QueryState, Screen, SectionHeader } from '@/components/ui/app-ui';
import { palette } from '@/constants/theme';
import { eventDate, loadActiveVoiceRooms, loadFriends, loadGroups, loadNotifications, loadProfile, loadUpcomingEvents, toPerson } from '@/lib/app-data';
import { useSupabaseQuery } from '@/hooks/use-supabase-query';
import { useAuth } from '@/providers/auth-provider';

export default function HomeScreen() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const query = useSupabaseQuery(async () => {
    if (!userId) return { profile: null, groups: [], friends: [], rooms: [], notifications: [], events: [] };
    const [profile, groups, friends, rooms, notifications, events] = await Promise.all([loadProfile(userId), loadGroups(userId), loadFriends(userId), loadActiveVoiceRooms(userId), loadNotifications(userId, 20), loadUpcomingEvents(userId)]);
    return { profile, groups, friends: friends.people, rooms, notifications, events };
  }, [userId], { profile: null, groups: [], friends: [], rooms: [], notifications: [], events: [] } as any);
  const { profile, groups, friends, rooms, notifications, events } = query.data;
  const room = rooms[0];
  const nextEvent = events[0];
  const unreadNotifications = notifications.filter((item: any) => !item.read_at).length;
  const onlineFriends = friends.filter((person: any) => person.status === 'online');

  return <Screen>
    <Animated.View entering={FadeInDown.springify().damping(18)} style={styles.appBar}>
      <Text style={styles.wordmark}>parallel</Text>
      <View style={styles.appActions}><Pressable onPress={() => router.push('/notifications')} style={styles.bell}><Ionicons name="notifications-outline" size={20} color={palette.text} />{unreadNotifications ? <View style={styles.badge}><Text style={styles.badgeText}>{Math.min(unreadNotifications, 9)}{unreadNotifications > 9 ? '+' : ''}</Text></View> : null}</Pressable>{profile ? <Pressable onPress={() => router.push('/profile')}><Avatar person={toPerson(profile)} size={42} showStatus={false} /></Pressable> : null}</View>
    </Animated.View>
    {query.loading || query.error ? <QueryState loading={query.loading} error={query.error} onRetry={query.refresh} /> : null}
    {room ? <View style={styles.roomCard}>
      <View style={styles.roomHeader}><Text style={styles.live}>●  LIVE</Text><Text style={styles.roomGroup}>{room.group.name}</Text></View>
      <Text style={styles.roomName}>{room.channelName}</Text>
      <View style={styles.participants}>{room.participants.slice(0, 4).map((person: any) => <Avatar key={person.id} person={person} size={36} showStatus={false} />)}<Text style={styles.capacity}>{room.participants.length} / 25</Text></View>
      <View style={styles.roomDetail}><Image source={require('@/assets/images/figma/room-artwork.png')} style={styles.roomArtwork} resizeMode="contain" /><View><Text style={styles.speaking}>{room.participants[0]?.name ?? 'Your friends'} {room.participants.length ? 'is speaking' : 'are waiting'}</Text><Text style={styles.roomMood}>Gaming · Chill</Text></View></View>
      <Pressable onPress={() => router.push(`/voice/${room.channelId}`)} style={({ pressed }) => [styles.joinRoom, pressed && styles.pressed]}><Text style={styles.joinRoomText}>Join room</Text></Pressable>
    </View> : <View style={[styles.roomCard, styles.emptyRoomCard]}><Text style={styles.live}>VOICE ROOMS</Text><Text style={styles.roomName}>It’s quiet here</Text><Text style={styles.roomMood}>Open a group and start the conversation.</Text><Pressable onPress={() => router.push('/groups')} style={styles.joinRoom}><Text style={styles.joinRoomText}>Open groups</Text></Pressable></View>}
    <View style={styles.afterRoom}><SectionHeader title="Next up" action="Calendar" onAction={() => router.push('/events')} />{nextEvent ? <Pressable onPress={() => router.push('/events')} style={({ pressed }) => [styles.eventCard, pressed && styles.pressed]}><View style={styles.eventDate}><Text style={styles.eventDay}>{new Date(nextEvent.starts_at).toLocaleDateString(undefined, { day: '2-digit' })}</Text><Text style={styles.eventMonth}>{new Date(nextEvent.starts_at).toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</Text></View><View style={styles.eventCopy}><Text style={styles.eventGroup}>{nextEvent.groupName}</Text><Text style={styles.eventTitle}>{nextEvent.title}</Text><Text style={styles.eventMeta}>{eventDate(nextEvent.starts_at)} · {nextEvent.going} going</Text></View><Ionicons name="chevron-forward" size={17} color={palette.textSubtle} /></Pressable> : <Pressable onPress={() => router.push('/events')} style={styles.emptyEvent}><Ionicons name="calendar-outline" size={18} color={palette.accent} /><Text style={styles.emptyEventText}>Schedule your group’s first hangout</Text><Ionicons name="add" size={17} color={palette.accent} /></Pressable>}</View>
    <View><SectionHeader title="Groups" action="View all" onAction={() => router.push('/groups')} /><View>{groups.slice(0, 3).map((group: any) => <Pressable key={group.id} onPress={() => router.push(`/group/${group.id}`)} style={({ pressed }) => [styles.groupRow, pressed && styles.pressed]}>
      <View style={styles.groupMark}><Ionicons name="grid-outline" size={23} color={palette.accent} /></View><View style={styles.groupCopy}><Text style={styles.groupName}>{group.name}</Text><Text numberOfLines={1} style={styles.groupMessage}>{group.lastMessage}</Text></View>{group.unread ? <Text style={styles.unread}>{group.unread}</Text> : null}
    </Pressable>)}</View>{!query.loading && !groups.length ? <QueryState empty="Create or join a group to start." /> : null}</View>
    <View><SectionHeader title="Online" action="Friends" onAction={() => router.push('/friends')} />{onlineFriends.length ? <View style={styles.friendRail}>{onlineFriends.slice(0, 4).map((person: any) => <Pressable key={person.id} onPress={() => router.push(`/channel/dm-${person.id}`)} style={styles.friend}><Avatar person={person} size={46} showStatus={false} /><Text numberOfLines={1} style={styles.friendName}>{person.name.split(' ')[0]}</Text></Pressable>)}</View> : <QueryState empty="Your online friends will appear here." />}</View>
  </Screen>;
}

const styles = StyleSheet.create({
  appBar: { height: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, wordmark: { color: palette.text, fontSize: 30, lineHeight: 39, fontWeight: '900', letterSpacing: -.6 }, appActions: { flexDirection: 'row', alignItems: 'center', gap: 8 }, bell: { width: 42, height: 42, borderRadius: 16, backgroundColor: palette.surface, alignItems: 'center', justifyContent: 'center' }, badge: { position: 'absolute', right: -2, top: -2, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.red, borderWidth: 2, borderColor: palette.canvas }, badgeText: { color: palette.white, fontSize: 8, fontWeight: '900' },
  roomCard: { minHeight: 286, backgroundColor: palette.surface, borderColor: palette.border, borderWidth: 1, borderRadius: 18, padding: 20 }, emptyRoomCard: { minHeight: 240 }, roomHeader: { height: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, live: { color: palette.cyan, fontSize: 11, fontWeight: '700' }, roomGroup: { color: palette.textMuted, fontSize: 11 }, roomName: { color: palette.text, fontSize: 26, lineHeight: 34, fontWeight: '900', letterSpacing: -.4, marginTop: 12 },
  participants: { height: 36, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }, capacity: { color: palette.textMuted, fontSize: 12 }, roomDetail: { height: 55, flexDirection: 'row', alignItems: 'flex-start', marginTop: 12 }, roomArtwork: { width: 135, height: 55 }, speaking: { color: palette.text, fontSize: 12, marginTop: 3 }, roomMood: { color: palette.textMuted, fontSize: 11, marginTop: 7 }, joinRoom: { height: 48, marginTop: 'auto', borderRadius: 18, backgroundColor: palette.accent, alignItems: 'center', justifyContent: 'center' }, joinRoomText: { color: palette.canvas, fontSize: 14, fontWeight: '800' },
  afterRoom: { marginTop: 0 }, eventCard: { minHeight: 82, borderRadius: 20, backgroundColor: palette.surface, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12 }, eventDate: { width: 52, height: 56, borderRadius: 16, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, eventDay: { color: palette.text, fontSize: 20, fontWeight: '900' }, eventMonth: { color: palette.accent, fontSize: 8, fontWeight: '900' }, eventCopy: { flex: 1, gap: 3 }, eventGroup: { color: palette.accentSoft, fontSize: 9, fontWeight: '800', textTransform: 'uppercase', letterSpacing: .7 }, eventTitle: { color: palette.text, fontSize: 14, fontWeight: '800' }, eventMeta: { color: palette.textMuted, fontSize: 10 }, emptyEvent: { minHeight: 58, borderRadius: 18, backgroundColor: palette.surface, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 11 }, emptyEventText: { flex: 1, color: palette.textMuted, fontSize: 11, fontWeight: '700' },
  groupRow: { height: 66, flexDirection: 'row', alignItems: 'center', gap: 13 }, groupMark: { width: 46, height: 46, borderRadius: 18, backgroundColor: palette.surfaceRaised, alignItems: 'center', justifyContent: 'center' }, groupCopy: { flex: 1, gap: 5 }, groupName: { color: palette.text, fontSize: 15, fontWeight: '700' }, groupMessage: { color: palette.textMuted, fontSize: 12 }, unread: { color: palette.accent, fontSize: 12, fontWeight: '700' }, friendRail: { flexDirection: 'row', justifyContent: 'space-between' }, friend: { width: 66, alignItems: 'center', gap: 5 }, friendName: { color: palette.text, fontSize: 11 }, pressed: { opacity: .72, transform: [{ scale: .985 }] },
});
