-- Roadmap-ready entities for authentication, DMs, media, notifications,
-- invitations, moderation, voice/video sessions, activities, events and discovery.

alter table public.profiles
  add column if not exists birth_date date,
  add column if not exists pronouns text check (char_length(pronouns) <= 40),
  add column if not exists timezone text not null default 'UTC',
  add column if not exists locale text not null default 'en',
  add column if not exists onboarding_completed boolean not null default false,
  add column if not exists last_seen_at timestamptz,
  add column if not exists deleted_at timestamptz;

create or replace function public.enforce_minimum_age()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.birth_date is not null then
    if new.birth_date > (current_date - interval '13 years')::date then raise exception 'users must be at least 13'; end if;
    new.age_group := case when new.birth_date > (current_date - interval '18 years')::date then 'teen' else 'adult' end;
  end if;
  return new;
end;
$$;
create trigger profiles_enforce_minimum_age before insert or update of birth_date on public.profiles for each row execute procedure public.enforce_minimum_age();

alter table public.channels drop constraint if exists channels_kind_check;
alter table public.channels add constraint channels_kind_check check (kind in ('text', 'voice', 'video', 'stage', 'forum'));

create table public.user_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  dm_privacy text not null default 'friends_and_shared_groups' check (dm_privacy in ('friends', 'friends_and_shared_groups', 'nobody')),
  friend_request_privacy text not null default 'everyone' check (friend_request_privacy in ('everyone', 'shared_groups', 'nobody')),
  show_activity boolean not null default true,
  allow_voice_pings boolean not null default true,
  notify_direct_messages boolean not null default true,
  notify_mentions boolean not null default true,
  notify_group_messages boolean not null default true,
  reduce_motion boolean not null default false,
  updated_at timestamptz not null default now()
);

create table public.user_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text,
  notifications_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index user_devices_user_id_idx on public.user_devices(user_id);

create table public.group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  code text not null unique check (char_length(code) between 8 and 80),
  max_uses integer check (max_uses is null or max_uses > 0),
  use_count integer not null default 0 check (use_count >= 0),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index group_invites_group_id_idx on public.group_invites(group_id);

create table public.group_bans (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid references public.profiles(id) on delete set null,
  reason text check (char_length(reason) <= 500),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.direct_conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  kind text not null default 'direct' check (kind in ('direct', 'group_dm')),
  title text check (char_length(title) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.direct_conversation_members (
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_until timestamptz,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index direct_conversation_members_user_idx on public.direct_conversation_members(user_id);

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.direct_conversations(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null default '' check (char_length(body) <= 4000),
  type text not null default 'text' check (type in ('text', 'image', 'video', 'document', 'voice_note', 'system')),
  reply_to_id uuid references public.direct_messages(id) on delete set null,
  edited_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (body <> '' or type <> 'text')
);
create index direct_messages_conversation_created_idx on public.direct_messages(conversation_id, created_at desc);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null check (bucket in ('avatars', 'chat-media')),
  storage_path text not null unique,
  media_kind text not null check (media_kind in ('image', 'video', 'document', 'audio')),
  mime_type text not null,
  byte_size bigint not null check (byte_size between 1 and 26214400),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 300000),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected', 'review')),
  created_at timestamptz not null default now()
);
create index media_assets_owner_idx on public.media_assets(owner_id, created_at desc);

create table public.message_attachments (
  message_id uuid not null references public.messages(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  position smallint not null default 0,
  primary key (message_id, asset_id)
);

create table public.direct_message_attachments (
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  asset_id uuid not null references public.media_assets(id) on delete cascade,
  position smallint not null default 0,
  primary key (message_id, asset_id)
);

create table public.message_mentions (
  message_id uuid not null references public.messages(id) on delete cascade,
  mentioned_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (message_id, mentioned_user_id)
);

create table public.pinned_messages (
  channel_id uuid not null references public.channels(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  pinned_by uuid references public.profiles(id) on delete set null,
  pinned_at timestamptz not null default now(),
  primary key (channel_id, message_id)
);

create table public.polls (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null unique references public.messages(id) on delete cascade,
  question text not null check (char_length(question) between 1 and 300),
  allows_multiple boolean not null default false,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 120),
  position smallint not null,
  unique (poll_id, position),
  unique (poll_id, id)
);

create table public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id),
  foreign key (poll_id, option_id) references public.poll_options(poll_id, id) on delete cascade
);
create index poll_votes_poll_user_idx on public.poll_votes(poll_id, user_id);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  type text not null check (type in ('direct_message', 'mention', 'reaction', 'friend_request', 'group_invite', 'voice_ping', 'event_reminder', 'moderation')),
  entity_type text,
  entity_id uuid,
  title text not null check (char_length(title) <= 160),
  body text not null default '' check (char_length(body) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;

create table public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.channels(id) on delete cascade,
  conversation_id uuid references public.direct_conversations(id) on delete cascade,
  started_by uuid not null references public.profiles(id) on delete restrict,
  provider_room_name text not null unique,
  mode text not null default 'voice' check (mode in ('voice', 'video', 'screen_share', 'watch_party')),
  status text not null default 'active' check (status in ('active', 'ended', 'failed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check ((channel_id is not null)::integer + (conversation_id is not null)::integer = 1)
);

create table public.call_participants (
  call_id uuid not null references public.call_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  microphone_muted boolean not null default false,
  deafened boolean not null default false,
  push_to_talk boolean not null default false,
  camera_enabled boolean not null default false,
  screen_sharing boolean not null default false,
  primary key (call_id, user_id, joined_at)
);

create table public.activity_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  activity_type text not null check (activity_type in ('bottle_spin', 'quiz', 'drawing', 'mini_game')),
  status text not null default 'lobby' check (status in ('lobby', 'active', 'finished', 'cancelled')),
  settings jsonb not null default '{}',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.activity_participants (
  session_id uuid not null references public.activity_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat_position smallint,
  joined_at timestamptz not null default now(),
  primary key (session_id, user_id)
);

create table public.bottle_spins (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.activity_sessions(id) on delete cascade,
  spun_by uuid references public.profiles(id) on delete set null,
  selected_user_id uuid not null references public.profiles(id) on delete restrict,
  deciding_user_id uuid references public.profiles(id) on delete set null,
  outcome text check (outcome in ('accepted', 'refused', 'respinned')),
  challenge_text text check (char_length(challenge_text) <= 500),
  server_seed_hash text not null,
  created_at timestamptz not null default now()
);

create table public.scheduled_events (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  channel_id uuid references public.channels(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  description text not null default '' check (char_length(description) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or ends_at > starts_at)
);

create table public.event_attendees (
  event_id uuid not null references public.scheduled_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  response text not null default 'interested' check (response in ('going', 'interested', 'declined')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create table public.community_categories (
  id bigint generated always as identity primary key,
  slug text not null unique,
  label text not null unique,
  position smallint not null default 0
);

create table public.group_category_links (
  group_id uuid not null references public.groups(id) on delete cascade,
  category_id bigint not null references public.community_categories(id) on delete cascade,
  primary key (group_id, category_id)
);

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.groups(id) on delete cascade,
  moderator_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  action text not null check (action in ('warn', 'mute', 'kick', 'ban', 'unban', 'remove_message', 'suspend')),
  reason text check (char_length(reason) <= 500),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index moderation_actions_group_created_idx on public.moderation_actions(group_id, created_at desc);

create table public.content_moderation_jobs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references public.media_assets(id) on delete cascade,
  message_id uuid references public.messages(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'processing', 'approved', 'flagged', 'failed')),
  result jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (asset_id is not null or message_id is not null)
);

create or replace function private.is_email_verified(requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = requested_user_id and email_confirmed_at is not null);
$$;

create or replace function private.are_friends(first_user uuid, second_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
      and ((requester_id = first_user and addressee_id = second_user)
        or (requester_id = second_user and addressee_id = first_user))
  );
$$;

create or replace function private.share_group(first_user uuid, second_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = first_user and b.user_id = second_user
  );
$$;

create or replace function private.can_direct_message(sender uuid, recipient uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select
    sender <> recipient
    and not exists (
      select 1 from public.blocks
      where (blocker_id = sender and blocked_id = recipient)
         or (blocker_id = recipient and blocked_id = sender)
    )
    and (private.are_friends(sender, recipient) or private.share_group(sender, recipient))
    and not exists (
      select 1 from public.profiles s, public.profiles r
      where s.id = sender and r.id = recipient
        and s.age_group = 'adult' and r.age_group = 'teen'
        and not private.are_friends(sender, recipient)
    );
$$;

create or replace function private.is_conversation_member(requested_conversation uuid, requested_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.direct_conversation_members where conversation_id = requested_conversation and user_id = requested_user);
$$;

create or replace function private.can_access_call(requested_call uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.call_sessions s
    left join public.channels c on c.id = s.channel_id
    where s.id = requested_call
      and ((s.channel_id is not null and private.is_group_member(c.group_id))
        or (s.conversation_id is not null and private.is_conversation_member(s.conversation_id)))
  );
$$;

create or replace function private.can_access_asset(requested_asset uuid, requested_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.media_assets a
    where a.id = requested_asset and (
      a.owner_id = requested_user
      or exists (select 1 from public.message_attachments ma where ma.asset_id = a.id and private.can_access_message(ma.message_id))
      or exists (
        select 1 from public.direct_message_attachments da
        join public.direct_messages dm on dm.id = da.message_id
        where da.asset_id = a.id and private.is_conversation_member(dm.conversation_id, requested_user)
      )
    )
  );
$$;

grant execute on all functions in schema private to authenticated;

create or replace function public.create_default_user_preferences()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.user_preferences(user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
create trigger on_profile_created_preferences after insert on public.profiles for each row execute procedure public.create_default_user_preferences();

insert into public.user_preferences(user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.add_conversation_creator()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.direct_conversation_members(conversation_id, user_id) values (new.id, new.created_by);
  return new;
end;
$$;
create trigger on_direct_conversation_created after insert on public.direct_conversations for each row execute procedure public.add_conversation_creator();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_username text;
begin
  requested_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^a-z0-9_]', '', 'g'));
  if char_length(requested_username) < 3 then requested_username := 'user'; end if;
  requested_username := left(requested_username, 15) || '_' || substr(new.id::text, 1, 8);
  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'New member'));
  return new;
end;
$$;

create or replace function public.redeem_group_invite(invite_code text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare invite_row public.group_invites%rowtype;
begin
  if auth.uid() is null or not private.is_email_verified(auth.uid()) then raise exception 'verified account required'; end if;
  select * into invite_row from public.group_invites
    where code = invite_code and revoked_at is null and (expires_at is null or expires_at > now())
      and (max_uses is null or use_count < max_uses) for update;
  if invite_row.id is null then raise exception 'invalid or expired invite'; end if;
  if exists (select 1 from public.group_bans where group_id = invite_row.group_id and user_id = auth.uid() and (expires_at is null or expires_at > now())) then raise exception 'banned from group'; end if;
  insert into public.group_members(group_id, user_id, role) values (invite_row.group_id, auth.uid(), 'member') on conflict do nothing;
  update public.group_invites set use_count = use_count + 1 where id = invite_row.id;
  return invite_row.group_id;
end;
$$;
grant execute on function public.redeem_group_invite(text) to authenticated;

create trigger user_preferences_set_updated_at before update on public.user_preferences for each row execute procedure public.set_updated_at();
create trigger direct_conversations_set_updated_at before update on public.direct_conversations for each row execute procedure public.set_updated_at();

alter table public.user_preferences enable row level security;
alter table public.user_devices enable row level security;
alter table public.group_invites enable row level security;
alter table public.group_bans enable row level security;
alter table public.direct_conversations enable row level security;
alter table public.direct_conversation_members enable row level security;
alter table public.direct_messages enable row level security;
alter table public.media_assets enable row level security;
alter table public.message_attachments enable row level security;
alter table public.direct_message_attachments enable row level security;
alter table public.message_mentions enable row level security;
alter table public.pinned_messages enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.notifications enable row level security;
alter table public.call_sessions enable row level security;
alter table public.call_participants enable row level security;
alter table public.activity_sessions enable row level security;
alter table public.activity_participants enable row level security;
alter table public.bottle_spins enable row level security;
alter table public.scheduled_events enable row level security;
alter table public.event_attendees enable row level security;
alter table public.community_categories enable row level security;
alter table public.group_category_links enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.content_moderation_jobs enable row level security;

create policy "Users manage their preferences" on public.user_preferences for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users manage their devices" on public.user_devices for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Group leaders view invites" on public.group_invites for select to authenticated using (private.has_group_role(group_id, array['owner','admin','moderator']));
create policy "Group leaders create invites" on public.group_invites for insert to authenticated with check ((select auth.uid()) = created_by and private.has_group_role(group_id, array['owner','admin','moderator']));
create policy "Group leaders update invites" on public.group_invites for update to authenticated using (private.has_group_role(group_id, array['owner','admin','moderator'])) with check (private.has_group_role(group_id, array['owner','admin','moderator']));
create policy "Group leaders delete invites" on public.group_invites for delete to authenticated using (private.has_group_role(group_id, array['owner','admin']));

create policy "Group leaders view bans" on public.group_bans for select to authenticated using (private.has_group_role(group_id, array['owner','admin','moderator']));
create policy "Group leaders create bans" on public.group_bans for insert to authenticated with check (private.has_group_role(group_id, array['owner','admin','moderator']));
create policy "Group leaders remove bans" on public.group_bans for delete to authenticated using (private.has_group_role(group_id, array['owner','admin']));

create policy "Members view direct conversations" on public.direct_conversations for select to authenticated using (private.is_conversation_member(id));
create policy "Verified users create conversations" on public.direct_conversations for insert to authenticated with check ((select auth.uid()) = created_by and private.is_email_verified());
create policy "Conversation creators update conversations" on public.direct_conversations for update to authenticated using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "Conversation creators delete conversations" on public.direct_conversations for delete to authenticated using ((select auth.uid()) = created_by);

create policy "Members view conversation membership" on public.direct_conversation_members for select to authenticated using (private.is_conversation_member(conversation_id));
create policy "Conversation members add permitted people" on public.direct_conversation_members for insert to authenticated with check (private.is_conversation_member(conversation_id) and private.can_direct_message((select auth.uid()), user_id));
create policy "Members update their membership" on public.direct_conversation_members for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Members leave conversations" on public.direct_conversation_members for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Members read direct messages" on public.direct_messages for select to authenticated using (private.is_conversation_member(conversation_id));
create policy "Verified members send direct messages" on public.direct_messages for insert to authenticated with check ((select auth.uid()) = author_id and private.is_conversation_member(conversation_id) and private.is_email_verified());
create policy "Authors edit direct messages" on public.direct_messages for update to authenticated using ((select auth.uid()) = author_id) with check ((select auth.uid()) = author_id);
create policy "Authors delete direct messages" on public.direct_messages for delete to authenticated using ((select auth.uid()) = author_id);

create policy "Authorized users view media metadata" on public.media_assets for select to authenticated using (private.can_access_asset(id));
create policy "Owners create media metadata" on public.media_assets for insert to authenticated with check ((select auth.uid()) = owner_id and private.is_email_verified());
create policy "Owners update media metadata" on public.media_assets for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "Owners delete media metadata" on public.media_assets for delete to authenticated using ((select auth.uid()) = owner_id);
create policy "Visible group attachments are readable" on public.message_attachments for select to authenticated using (private.can_access_message(message_id));
create policy "Message authors attach media" on public.message_attachments for insert to authenticated with check (exists (select 1 from public.messages m where m.id = message_id and m.author_id = (select auth.uid())) and exists (select 1 from public.media_assets a where a.id = asset_id and a.owner_id = (select auth.uid())));
create policy "Message authors detach media" on public.message_attachments for delete to authenticated using (exists (select 1 from public.messages m where m.id = message_id and m.author_id = (select auth.uid())));
create policy "Visible DM attachments are readable" on public.direct_message_attachments for select to authenticated using (exists (select 1 from public.direct_messages m where m.id = message_id and private.is_conversation_member(m.conversation_id)));
create policy "DM authors attach media" on public.direct_message_attachments for insert to authenticated with check (exists (select 1 from public.direct_messages m where m.id = message_id and m.author_id = (select auth.uid())) and exists (select 1 from public.media_assets a where a.id = asset_id and a.owner_id = (select auth.uid())));
create policy "DM authors detach media" on public.direct_message_attachments for delete to authenticated using (exists (select 1 from public.direct_messages m where m.id = message_id and m.author_id = (select auth.uid())));

create policy "Visible mentions are readable" on public.message_mentions for select to authenticated using (private.can_access_message(message_id));
create policy "Message authors create mentions" on public.message_mentions for insert to authenticated with check (exists (select 1 from public.messages m where m.id = message_id and m.author_id = (select auth.uid())));
create policy "Visible pins are readable" on public.pinned_messages for select to authenticated using (private.can_access_message(message_id));
create policy "Moderators manage pins" on public.pinned_messages for all to authenticated using (exists (select 1 from public.channels c where c.id = channel_id and private.has_group_role(c.group_id, array['owner','admin','moderator']))) with check (exists (select 1 from public.channels c where c.id = channel_id and private.has_group_role(c.group_id, array['owner','admin','moderator'])));

create policy "Visible polls are readable" on public.polls for select to authenticated using (private.can_access_message(message_id));
create policy "Message authors create polls" on public.polls for insert to authenticated with check (exists (select 1 from public.messages m where m.id = message_id and m.author_id = (select auth.uid())));
create policy "Visible poll options are readable" on public.poll_options for select to authenticated using (exists (select 1 from public.polls p where p.id = poll_id and private.can_access_message(p.message_id)));
create policy "Poll authors create options" on public.poll_options for insert to authenticated with check (exists (select 1 from public.polls p join public.messages m on m.id = p.message_id where p.id = poll_id and m.author_id = (select auth.uid())));
create policy "Visible poll votes are readable" on public.poll_votes for select to authenticated using (exists (select 1 from public.polls p where p.id = poll_id and private.can_access_message(p.message_id)));
create policy "Users manage their votes" on public.poll_votes for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and private.is_email_verified());

create policy "Users read their notifications" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users update their notifications" on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users delete their notifications" on public.notifications for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Authorized users view calls" on public.call_sessions for select to authenticated using (private.can_access_call(id));
create policy "Members start calls" on public.call_sessions for insert to authenticated with check ((select auth.uid()) = started_by and private.is_email_verified() and ((channel_id is not null and exists (select 1 from public.channels c where c.id = channel_id and private.is_group_member(c.group_id))) or (conversation_id is not null and private.is_conversation_member(conversation_id))));
create policy "Call starters update calls" on public.call_sessions for update to authenticated using ((select auth.uid()) = started_by) with check ((select auth.uid()) = started_by);
create policy "Authorized users view call participants" on public.call_participants for select to authenticated using (private.can_access_call(call_id));
create policy "Users manage their call presence" on public.call_participants for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and private.can_access_call(call_id));

create policy "Members view activities" on public.activity_sessions for select to authenticated using (private.is_group_member(group_id));
create policy "Members create activities" on public.activity_sessions for insert to authenticated with check ((select auth.uid()) = created_by and private.is_group_member(group_id) and private.is_email_verified());
create policy "Activity creators update activities" on public.activity_sessions for update to authenticated using ((select auth.uid()) = created_by) with check ((select auth.uid()) = created_by);
create policy "Members view activity participants" on public.activity_participants for select to authenticated using (exists (select 1 from public.activity_sessions s where s.id = session_id and private.is_group_member(s.group_id)));
create policy "Users manage their activity presence" on public.activity_participants for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.activity_sessions s where s.id = session_id and private.is_group_member(s.group_id)));
create policy "Members view bottle spins" on public.bottle_spins for select to authenticated using (exists (select 1 from public.activity_sessions s where s.id = session_id and private.is_group_member(s.group_id)));
create policy "Activity creators record spins" on public.bottle_spins for insert to authenticated with check (exists (select 1 from public.activity_sessions s where s.id = session_id and s.created_by = (select auth.uid())));

create policy "Members view events" on public.scheduled_events for select to authenticated using (private.can_view_group(group_id));
create policy "Members create events" on public.scheduled_events for insert to authenticated with check ((select auth.uid()) = created_by and private.is_group_member(group_id));
create policy "Event creators and leaders update events" on public.scheduled_events for update to authenticated using ((select auth.uid()) = created_by or private.has_group_role(group_id, array['owner','admin','moderator'])) with check ((select auth.uid()) = created_by or private.has_group_role(group_id, array['owner','admin','moderator']));
create policy "Members view event attendees" on public.event_attendees for select to authenticated using (exists (select 1 from public.scheduled_events e where e.id = event_id and private.can_view_group(e.group_id)));
create policy "Users manage their event response" on public.event_attendees for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create policy "Categories are readable" on public.community_categories for select to authenticated using (true);
create policy "Public group categories are readable" on public.group_category_links for select to authenticated using (private.can_view_group(group_id));
create policy "Group leaders manage categories" on public.group_category_links for all to authenticated using (private.has_group_role(group_id, array['owner','admin'])) with check (private.has_group_role(group_id, array['owner','admin']));

create policy "Group leaders view moderation actions" on public.moderation_actions for select to authenticated using (group_id is not null and private.has_group_role(group_id, array['owner','admin','moderator']));
create policy "Group leaders create moderation actions" on public.moderation_actions for insert to authenticated with check ((select auth.uid()) = moderator_id and group_id is not null and private.has_group_role(group_id, array['owner','admin','moderator']));

-- Moderation jobs are server-owned; no client write policy is intentionally provided.
create policy "Asset owners view moderation jobs" on public.content_moderation_jobs for select to authenticated using (asset_id is not null and exists (select 1 from public.media_assets a where a.id = asset_id and a.owner_id = (select auth.uid())));

-- Tighten write policies created in the initial migration so confirmed email is
-- required even if the dashboard's confirmation switch is changed later.
drop policy if exists "Users can create owned groups" on public.groups;
create policy "Users can create owned groups" on public.groups for insert to authenticated with check ((select auth.uid()) = owner_id and private.is_email_verified());
drop policy if exists "Users can request friendships" on public.friendships;
create policy "Users can request friendships" on public.friendships for insert to authenticated with check ((select auth.uid()) = requester_id and private.is_email_verified());
drop policy if exists "Members can send messages" on public.messages;
create policy "Members can send messages" on public.messages for insert to authenticated with check ((select auth.uid()) = author_id and private.is_email_verified() and exists (select 1 from public.channels c where c.id = channel_id and private.is_group_member(c.group_id)));
alter table public.messages drop constraint if exists messages_check;
alter table public.messages add constraint messages_content_check check (body <> '' or attachment_path is not null or type <> 'text');
drop policy if exists "Users can add their reactions" on public.message_reactions;
create policy "Users can add their reactions" on public.message_reactions for insert to authenticated with check ((select auth.uid()) = user_id and private.is_email_verified() and private.can_access_message(message_id));
drop policy if exists "Users can submit reports" on public.reports;
create policy "Users can submit reports" on public.reports for insert to authenticated with check ((select auth.uid()) = reporter_id and private.is_email_verified());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 10485760, array['image/jpeg','image/png','image/webp']),
  ('chat-media', 'chat-media', false, 26214400, array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/quicktime','audio/mpeg','audio/mp4','audio/webm','application/pdf','text/plain'])
on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "Users upload their avatars" on storage.objects for insert to authenticated with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users read their avatars" on storage.objects for select to authenticated using (bucket_id = 'avatars');
create policy "Users update their avatars" on storage.objects for update to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text) with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users delete their avatars" on storage.objects for delete to authenticated using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Users upload chat media" on storage.objects for insert to authenticated with check (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select auth.uid())::text and private.is_email_verified());
create policy "Users read authorized chat media" on storage.objects for select to authenticated using (bucket_id = 'chat-media' and exists (select 1 from public.media_assets a where a.storage_path = name and a.bucket = bucket_id and private.can_access_asset(a.id)));
create policy "Users delete their chat media" on storage.objects for delete to authenticated using (bucket_id = 'chat-media' and (storage.foldername(name))[1] = (select auth.uid())::text);

alter publication supabase_realtime add table public.direct_messages;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.call_sessions;
alter publication supabase_realtime add table public.call_participants;
alter publication supabase_realtime add table public.activity_sessions;
alter publication supabase_realtime add table public.activity_participants;
