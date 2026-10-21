-- Turn social activity into an actionable notification inbox.
-- All writes happen server-side; clients can only read/update their own rows.

create or replace function private.notifications_enabled(target_user uuid, preference text default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case preference
    when 'direct' then coalesce((select p.notify_direct_messages from public.user_preferences p where p.user_id = target_user), true)
    when 'voice' then coalesce((select p.allow_voice_pings from public.user_preferences p where p.user_id = target_user), true)
    else true
  end;
$$;

create or replace function private.notify_direct_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_name text;
begin
  select display_name into actor_name from public.profiles where id = new.author_id;
  insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
  select member.user_id, new.author_id, 'direct_message', 'profile', new.author_id,
    coalesce(actor_name, 'Someone') || ' sent you a message', left(new.body, 180)
  from public.direct_conversation_members member
  where member.conversation_id = new.conversation_id
    and member.user_id <> new.author_id
    and private.notifications_enabled(member.user_id, 'direct')
    and not exists (select 1 from public.blocks b where (b.blocker_id = member.user_id and b.blocked_id = new.author_id) or (b.blocker_id = new.author_id and b.blocked_id = member.user_id));
  return new;
end;
$$;

create or replace function private.notify_friend_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_name text;
begin
  if new.status <> 'pending' then return new; end if;
  select display_name into actor_name from public.profiles where id = new.requester_id;
  insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
  values (new.addressee_id, new.requester_id, 'friend_request', 'profile', new.requester_id, coalesce(actor_name, 'Someone') || ' sent a friend request', 'Open Friends to respond.');
  return new;
end;
$$;

create or replace function private.notify_message_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recipient uuid; target_channel uuid; actor_name text;
begin
  select m.author_id, m.channel_id into recipient, target_channel from public.messages m where m.id = new.message_id;
  if recipient is null or recipient = new.user_id then return new; end if;
  select display_name into actor_name from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
  values (recipient, new.user_id, 'reaction', 'channel', target_channel, coalesce(actor_name, 'Someone') || ' reacted ' || new.emoji, 'Long-press messages to join the reaction.');
  return new;
end;
$$;

create or replace function private.notify_scheduled_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare group_name text;
begin
  select name into group_name from public.groups where id = new.group_id;
  insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
  select member.user_id, new.created_by, 'event_reminder', 'event', new.id,
    'New plan in ' || coalesce(group_name, 'your group'), new.title
  from public.group_members member
  where member.group_id = new.group_id and member.user_id <> new.created_by;
  return new;
end;
$$;

create or replace function private.notify_voice_room_started()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare target_group uuid; room_name text; actor_name text;
begin
  if new.channel_id is null or new.status <> 'active' then return new; end if;
  select c.group_id, c.name into target_group, room_name from public.channels c where c.id = new.channel_id;
  select display_name into actor_name from public.profiles where id = new.started_by;
  insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
  select member.user_id, new.started_by, 'voice_ping', 'channel', new.channel_id,
    coalesce(actor_name, 'Someone') || ' started a voice room', 'Join ' || coalesce(room_name, 'the conversation') || ' now.'
  from public.group_members member
  where member.group_id = target_group and member.user_id <> new.started_by
    and private.notifications_enabled(member.user_id, 'voice');
  return new;
end;
$$;

drop trigger if exists direct_messages_create_notification on public.direct_messages;
create trigger direct_messages_create_notification after insert on public.direct_messages for each row execute procedure private.notify_direct_message();

drop trigger if exists friendships_create_notification on public.friendships;
create trigger friendships_create_notification after insert on public.friendships for each row execute procedure private.notify_friend_request();

drop trigger if exists reactions_create_notification on public.message_reactions;
create trigger reactions_create_notification after insert on public.message_reactions for each row execute procedure private.notify_message_reaction();

drop trigger if exists events_create_notification on public.scheduled_events;
create trigger events_create_notification after insert on public.scheduled_events for each row execute procedure private.notify_scheduled_event();

drop trigger if exists calls_create_notification on public.call_sessions;
create trigger calls_create_notification after insert on public.call_sessions for each row execute procedure private.notify_voice_room_started();
