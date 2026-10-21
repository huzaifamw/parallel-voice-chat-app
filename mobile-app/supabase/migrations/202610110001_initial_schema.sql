-- Circle MVP schema. Run with the Supabase CLI or paste into the SQL Editor.
create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  bio text not null default '' check (char_length(bio) <= 240),
  avatar_path text,
  status text not null default 'online' check (status in ('online', 'idle', 'busy', 'invisible', 'offline')),
  age_group text not null default 'adult' check (age_group in ('teen', 'adult')),
  favorite_games text[] not null default '{}',
  interests text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_username_lower_key on public.profiles (lower(username));

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete restrict,
  name text not null check (char_length(name) between 1 and 80),
  description text not null default '' check (char_length(description) <= 500),
  avatar_path text,
  visibility text not null default 'private' check (visibility in ('private', 'public')),
  member_limit integer not null default 100 check (member_limit between 2 and 100),
  disappearing_messages_hours integer check (disappearing_messages_hours between 1 and 8760),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'moderator', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_id_idx on public.group_members(user_id);

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  name text not null check (name ~ '^[a-z0-9][a-z0-9_-]{0,39}$'),
  kind text not null check (kind in ('text', 'voice')),
  position integer not null default 0,
  is_private boolean not null default false,
  created_at timestamptz not null default now(),
  unique (group_id, name)
);

create index channels_group_id_position_idx on public.channels(group_id, position);

create table public.friendships (
  requester_id uuid not null references public.profiles(id) on delete cascade,
  addressee_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null default '' check (char_length(body) <= 4000),
  type text not null default 'text' check (type in ('text', 'image', 'video', 'document', 'voice_note', 'system')),
  attachment_path text,
  reply_to_id uuid references public.messages(id) on delete set null,
  edited_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check (body <> '' or attachment_path is not null or type = 'system')
);

create index messages_channel_created_idx on public.messages(channel_id, created_at desc);
create index messages_expires_at_idx on public.messages(expires_at) where expires_at is not null;

create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null check (char_length(reason) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'dismissed')),
  created_at timestamptz not null default now(),
  check (target_user_id is not null or message_id is not null)
);

create index reports_status_created_idx on public.reports(status, created_at);

create or replace function private.is_group_member(requested_group_id uuid, requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = requested_group_id and user_id = requested_user_id
  );
$$;

create or replace function private.has_group_role(requested_group_id uuid, allowed_roles text[], requested_user_id uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.group_members
    where group_id = requested_group_id and user_id = requested_user_id and role = any(allowed_roles)
  );
$$;

create or replace function private.can_view_group(requested_group_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.groups
    where id = requested_group_id
      and (visibility = 'public' or private.is_group_member(id, auth.uid()))
  );
$$;

create or replace function private.can_access_message(requested_message_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.messages m
    join public.channels c on c.id = m.channel_id
    where m.id = requested_message_id and private.can_view_group(c.group_id)
  );
$$;

grant execute on all functions in schema private to authenticated;

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger groups_set_updated_at before update on public.groups for each row execute procedure public.set_updated_at();
create trigger friendships_set_updated_at before update on public.friendships for each row execute procedure public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  requested_username text;
begin
  requested_username := lower(regexp_replace(coalesce(new.raw_user_meta_data ->> 'username', ''), '[^a-z0-9_]', '', 'g'));
  if char_length(requested_username) < 3 then
    requested_username := 'user_' || substr(new.id::text, 1, 8);
  end if;

  insert into public.profiles (id, username, display_name)
  values (
    new.id,
    requested_username,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), split_part(new.email, '@', 1), 'New member')
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace function public.add_group_owner_membership()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.group_members (group_id, user_id, role) values (new.id, new.owner_id, 'owner');
  return new;
end;
$$;

create trigger on_group_created after insert on public.groups for each row execute procedure public.add_group_owner_membership();

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.channels enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.messages enable row level security;
alter table public.message_reactions enable row level security;
alter table public.reports enable row level security;

create policy "Authenticated users can view profiles" on public.profiles for select to authenticated using (true);
create policy "Users create their own profile" on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy "Users update their own profile" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy "Users can view public or joined groups" on public.groups for select to authenticated using (visibility = 'public' or private.is_group_member(id));
create policy "Users can create owned groups" on public.groups for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "Group leaders can update groups" on public.groups for update to authenticated using (private.has_group_role(id, array['owner','admin'])) with check (private.has_group_role(id, array['owner','admin']));
create policy "Owners can delete groups" on public.groups for delete to authenticated using (private.has_group_role(id, array['owner']));

create policy "Visible group memberships are readable" on public.group_members for select to authenticated using (private.can_view_group(group_id));
create policy "Group leaders can add members" on public.group_members for insert to authenticated with check (private.has_group_role(group_id, array['owner','admin']));
create policy "Group leaders can update members" on public.group_members for update to authenticated using (private.has_group_role(group_id, array['owner','admin'])) with check (private.has_group_role(group_id, array['owner','admin']));
create policy "Members can leave and leaders can remove" on public.group_members for delete to authenticated using ((select auth.uid()) = user_id or private.has_group_role(group_id, array['owner','admin','moderator']));

create policy "Visible group channels are readable" on public.channels for select to authenticated using (private.can_view_group(group_id));
create policy "Group leaders can create channels" on public.channels for insert to authenticated with check ((select auth.uid()) = created_by and private.has_group_role(group_id, array['owner','admin','moderator']));
create policy "Group leaders can update channels" on public.channels for update to authenticated using (private.has_group_role(group_id, array['owner','admin','moderator'])) with check (private.has_group_role(group_id, array['owner','admin','moderator']));
create policy "Group leaders can delete channels" on public.channels for delete to authenticated using (private.has_group_role(group_id, array['owner','admin','moderator']));

create policy "Users can view their friendships" on public.friendships for select to authenticated using ((select auth.uid()) in (requester_id, addressee_id));
create policy "Users can request friendships" on public.friendships for insert to authenticated with check ((select auth.uid()) = requester_id);
create policy "Participants can update friendships" on public.friendships for update to authenticated using ((select auth.uid()) in (requester_id, addressee_id)) with check ((select auth.uid()) in (requester_id, addressee_id));
create policy "Participants can delete friendships" on public.friendships for delete to authenticated using ((select auth.uid()) in (requester_id, addressee_id));

create policy "Users can view their blocks" on public.blocks for select to authenticated using ((select auth.uid()) = blocker_id);
create policy "Users can block others" on public.blocks for insert to authenticated with check ((select auth.uid()) = blocker_id);
create policy "Users can unblock others" on public.blocks for delete to authenticated using ((select auth.uid()) = blocker_id);

create policy "Users can read visible group messages" on public.messages for select to authenticated using (exists (select 1 from public.channels c where c.id = channel_id and private.can_view_group(c.group_id)));
create policy "Members can send messages" on public.messages for insert to authenticated with check ((select auth.uid()) = author_id and exists (select 1 from public.channels c where c.id = channel_id and private.is_group_member(c.group_id)));
create policy "Authors and moderators can edit messages" on public.messages for update to authenticated using ((select auth.uid()) = author_id or exists (select 1 from public.channels c where c.id = channel_id and private.has_group_role(c.group_id, array['owner','admin','moderator']))) with check ((select auth.uid()) = author_id or exists (select 1 from public.channels c where c.id = channel_id and private.has_group_role(c.group_id, array['owner','admin','moderator'])));
create policy "Authors and moderators can delete messages" on public.messages for delete to authenticated using ((select auth.uid()) = author_id or exists (select 1 from public.channels c where c.id = channel_id and private.has_group_role(c.group_id, array['owner','admin','moderator'])));

create policy "Users can view visible reactions" on public.message_reactions for select to authenticated using (private.can_access_message(message_id));
create policy "Users can add their reactions" on public.message_reactions for insert to authenticated with check ((select auth.uid()) = user_id and private.can_access_message(message_id));
create policy "Users can remove their reactions" on public.message_reactions for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Users can view reports they submitted" on public.reports for select to authenticated using ((select auth.uid()) = reporter_id);
create policy "Users can submit reports" on public.reports for insert to authenticated with check ((select auth.uid()) = reporter_id);

-- Realtime publication for chat and presence-adjacent tables.
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.message_reactions;
alter publication supabase_realtime add table public.group_members;
