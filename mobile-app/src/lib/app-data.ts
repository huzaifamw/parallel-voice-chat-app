import { supabase } from '@/lib/supabase';

export type PresenceStatus = 'online' | 'idle' | 'busy' | 'invisible' | 'offline';

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  status: PresenceStatus;
  favorite_games: string[];
  interests: string[];
  last_seen_at: string | null;
};

export type Person = {
  id: string;
  name: string;
  handle: string;
  initials: string;
  color: string;
  status: PresenceStatus;
  activity?: string;
  avatarUrl?: string;
};

export type AppGroup = {
  id: string;
  name: string;
  description: string;
  avatar_path: string | null;
  member_limit: number;
  members: number;
  online: number;
  unread: number;
  lastMessage: string;
  lastMessageAt: string | null;
  color: string;
  emoji: string;
};

export type AppNotification = {
  id: string;
  type: string;
  title: string;
  body: string;
  entity_type: string | null;
  entity_id: string | null;
  read_at: string | null;
  created_at: string;
  actor: Person | null;
};

export type ScheduledEvent = {
  id: string;
  group_id: string;
  channel_id: string | null;
  created_by: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string | null;
  groupName: string;
  response: 'going' | 'interested' | 'declined' | null;
  going: number;
  interested: number;
};

export const avatarColors = ['#8B6CFF', '#28C7B7', '#F780B8', '#FFAD5B', '#55A7FF', '#7C5CFF'];

function hash(value: string) {
  return [...value].reduce((total, character) => ((total << 5) - total + character.charCodeAt(0)) | 0, 0);
}

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?';
}

export function avatarUrl(path: string | null | undefined) {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  // The avatars bucket is private. A later media loader can attach a signed URL;
  // until then, render database-derived initials instead of a broken public URL.
  return undefined;
}

export function toPerson(profile: Profile, activity?: string): Person {
  return {
    id: profile.id,
    name: profile.display_name,
    handle: `@${profile.username}`,
    initials: initials(profile.display_name),
    color: avatarColors[Math.abs(hash(profile.id)) % avatarColors.length],
    status: profile.status,
    activity: activity || (profile.status === 'offline' ? 'Offline' : profile.status === 'online' ? 'Online' : profile.status),
    avatarUrl: avatarUrl(profile.avatar_path),
  };
}

export function groupVisual(id: string, name: string) {
  return {
    color: avatarColors[Math.abs(hash(id)) % avatarColors.length],
    emoji: initials(name),
  };
}

export function relativeTime(value: string | null | undefined) {
  if (!value) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return 'now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function clockTime(value: string) {
  return new Date(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function eventDate(value: string) {
  const date = new Date(value);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString();
  const label = sameDay(date, today) ? 'Today' : sameDay(date, tomorrow) ? 'Tomorrow' : date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${label} · ${date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

export async function loadNotifications(userId: string, limit = 40) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(limit);
  if (error) throw error;
  const actorIds = [...new Set((data ?? []).map((item) => item.actor_id).filter(Boolean))] as string[];
  let actors: Profile[] = [];
  if (actorIds.length) {
    const { data: profiles, error: profileError } = await supabase.from('profiles').select('*').in('id', actorIds);
    if (profileError) throw profileError;
    actors = (profiles ?? []) as Profile[];
  }
  const actorMap = new Map(actors.map((profile) => [profile.id, toPerson(profile)]));
  return (data ?? []).map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    body: item.body,
    entity_type: item.entity_type,
    entity_id: item.entity_id,
    read_at: item.read_at,
    created_at: item.created_at,
    actor: item.actor_id ? actorMap.get(item.actor_id) ?? null : null,
  } satisfies AppNotification));
}

export async function loadUpcomingEvents(userId: string, groupId?: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const groups = await loadGroups(userId);
  const visibleGroups = groupId ? groups.filter((group) => group.id === groupId) : groups;
  if (!visibleGroups.length) return [] as ScheduledEvent[];
  const groupIds = visibleGroups.map((group) => group.id);
  const { data: events, error } = await supabase.from('scheduled_events').select('*').in('group_id', groupIds).gte('starts_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()).order('starts_at').limit(30);
  if (error) throw error;
  const eventIds = (events ?? []).map((event) => event.id);
  let attendees: { event_id: string; user_id: string; response: 'going' | 'interested' | 'declined' }[] = [];
  if (eventIds.length) {
    const { data, error: attendeeError } = await supabase.from('event_attendees').select('event_id, user_id, response').in('event_id', eventIds);
    if (attendeeError) throw attendeeError;
    attendees = (data ?? []) as typeof attendees;
  }
  const groupNames = new Map(visibleGroups.map((group) => [group.id, group.name]));
  return (events ?? []).map((event) => {
    const responses = attendees.filter((attendee) => attendee.event_id === event.id);
    return {
      ...event,
      groupName: groupNames.get(event.group_id) ?? 'Group',
      response: responses.find((attendee) => attendee.user_id === userId)?.response ?? null,
      going: responses.filter((attendee) => attendee.response === 'going').length,
      interested: responses.filter((attendee) => attendee.response === 'interested').length,
    } satisfies ScheduledEvent;
  });
}

export async function loadProfile(userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  if (data) return data as Profile;

  // Repair accounts that existed before the auth-to-profile trigger was installed.
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user || authData.user.id !== userId) throw new Error('Your account profile could not be found.');
  const metadata = authData.user.user_metadata ?? {};
  const requested = String(metadata.username ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  const base = (requested.length >= 3 ? requested : 'user').slice(0, 15);
  const username = `${base}_${userId.slice(0, 8)}`;
  const displayName = String(metadata.display_name || authData.user.email?.split('@')[0] || 'New member').slice(0, 40);
  const { data: created, error: createError } = await supabase.from('profiles').insert({ id: userId, username, display_name: displayName }).select('*').single();
  if (createError) throw createError;
  return created as Profile;
}

export async function loadFriends(userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: rows, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id, status, created_at')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
    .order('updated_at', { ascending: false });
  if (error) throw error;

  const ids = (rows ?? []).map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id);
  if (!ids.length) return { people: [] as Person[], pending: 0, requests: [] as { requesterId: string; addresseeId: string; incoming: boolean; person: Person }[] };
  const { data: profiles, error: profilesError } = await supabase.from('profiles').select('*').in('id', ids);
  if (profilesError) throw profilesError;
  const accepted = new Set((rows ?? []).filter((row) => row.status === 'accepted').map((row) => row.requester_id === userId ? row.addressee_id : row.requester_id));
  const profileMap = new Map((profiles as Profile[]).map((profile) => [profile.id, profile]));
  const requests = (rows ?? []).filter((row) => row.status === 'pending').map((row) => {
    const otherId = row.requester_id === userId ? row.addressee_id : row.requester_id;
    const profile = profileMap.get(otherId);
    return profile ? { requesterId: row.requester_id, addresseeId: row.addressee_id, incoming: row.addressee_id === userId, person: toPerson(profile) } : null;
  }).filter(Boolean) as { requesterId: string; addresseeId: string; incoming: boolean; person: Person }[];
  return { people: (profiles as Profile[]).filter((profile) => accepted.has(profile.id)).map((profile) => toPerson(profile)), pending: requests.length, requests };
}

export async function loadGroups(userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: memberships, error } = await supabase.from('group_members').select('group_id').eq('user_id', userId);
  if (error) throw error;
  const groupIds = (memberships ?? []).map((row) => row.group_id);
  if (!groupIds.length) return [] as AppGroup[];

  const [{ data: groups, error: groupsError }, { data: members, error: membersError }, { data: channels, error: channelsError }] = await Promise.all([
    supabase.from('groups').select('*').in('id', groupIds).order('updated_at', { ascending: false }),
    supabase.from('group_members').select('group_id, profiles(id, status)').in('group_id', groupIds),
    supabase.from('channels').select('id, group_id').in('group_id', groupIds).eq('kind', 'text'),
  ]);
  if (groupsError) throw groupsError;
  if (membersError) throw membersError;
  if (channelsError) throw channelsError;

  const channelGroup = new Map((channels ?? []).map((channel) => [channel.id, channel.group_id]));
  const channelIds = [...channelGroup.keys()];
  let latestMessages: { channel_id: string; body: string; created_at: string }[] = [];
  if (channelIds.length) {
    const { data, error: messagesError } = await supabase.from('messages').select('channel_id, body, created_at').in('channel_id', channelIds).order('created_at', { ascending: false }).limit(200);
    if (messagesError) throw messagesError;
    latestMessages = data ?? [];
  }

  return (groups ?? []).map((group) => {
    const groupMembers = (members ?? []).filter((member) => member.group_id === group.id);
    const latest = latestMessages.find((message) => channelGroup.get(message.channel_id) === group.id);
    return {
      id: group.id,
      name: group.name,
      description: group.description,
      avatar_path: group.avatar_path,
      member_limit: group.member_limit,
      members: groupMembers.length,
      online: groupMembers.filter((member) => {
        const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
        return profile && profile.status === 'online';
      }).length,
      unread: 0,
      lastMessage: latest?.body || group.description || 'No messages yet',
      lastMessageAt: latest?.created_at ?? null,
      ...groupVisual(group.id, group.name),
    } satisfies AppGroup;
  });
}

export async function findOrCreateDirectConversation(userId: string, friendId: string, create = false) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const { data: mine, error: mineError } = await supabase.from('direct_conversation_members').select('conversation_id').eq('user_id', userId);
  if (mineError) throw mineError;
  const ids = (mine ?? []).map((row) => row.conversation_id);
  if (ids.length) {
    const { data: shared, error: sharedError } = await supabase.from('direct_conversation_members').select('conversation_id').eq('user_id', friendId).in('conversation_id', ids).limit(1).maybeSingle();
    if (sharedError) throw sharedError;
    if (shared) return shared.conversation_id as string;
  }
  if (!create) return null;
  const { data: conversationId, error: createError } = await supabase.rpc('get_or_create_direct_conversation', { other_user_id: friendId });
  if (createError) throw createError;
  if (!conversationId) throw new Error('Could not create this conversation.');
  return conversationId as string;
}

export async function loadActiveVoiceRooms(userId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const groups = await loadGroups(userId);
  if (!groups.length) return [];
  const { data: channels, error: channelError } = await supabase.from('channels').select('id, group_id, name').in('group_id', groups.map((group) => group.id)).eq('kind', 'voice');
  if (channelError) throw channelError;
  const channelIds = (channels ?? []).map((channel) => channel.id);
  if (!channelIds.length) return [];
  const { data: calls, error: callError } = await supabase
    .from('call_sessions')
    .select('id, channel_id, started_at, call_participants(user_id, left_at, microphone_muted, profiles(*))')
    .in('channel_id', channelIds)
    .eq('status', 'active')
    .order('started_at', { ascending: false });
  if (callError) throw callError;
  return (calls ?? []).map((call) => {
    const channel = (channels ?? []).find((item) => item.id === call.channel_id)!;
    const group = groups.find((item) => item.id === channel.group_id)!;
    const participants = (call.call_participants ?? []).filter((participant: any) => !participant.left_at).map((participant: any) => {
      const profile = Array.isArray(participant.profiles) ? participant.profiles[0] : participant.profiles;
      return profile ? toPerson(profile as Profile) : null;
    }).filter(Boolean) as Person[];
    return { id: call.id as string, channelId: channel.id as string, channelName: channel.name as string, group, startedAt: call.started_at as string, participants };
  });
}

export async function loadGroupDetail(groupId: string) {
  if (!supabase) throw new Error('Supabase is not configured.');
  const [{ data: group, error: groupError }, { data: channels, error: channelError }, { data: members, error: memberError }] = await Promise.all([
    supabase.from('groups').select('*').eq('id', groupId).single(),
    supabase.from('channels').select('*').eq('group_id', groupId).order('position'),
    supabase.from('group_members').select('role, joined_at, profiles(*)').eq('group_id', groupId).order('joined_at'),
  ]);
  if (groupError) throw groupError;
  if (channelError) throw channelError;
  if (memberError) throw memberError;
  const people = (members ?? []).map((member: any) => {
    const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles;
    return profile ? toPerson(profile as Profile) : null;
  }).filter(Boolean) as Person[];
  const visual = groupVisual(group.id, group.name);
  return {
    group: { ...group, ...visual, members: people.length, online: people.filter((person) => person.status === 'online').length },
    channels: channels ?? [],
    memberships: members ?? [],
    people,
  };
}
