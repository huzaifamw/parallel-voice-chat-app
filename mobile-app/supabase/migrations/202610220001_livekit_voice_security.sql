-- Trusted LiveKit voice authorization and lifecycle synchronization.
-- Existing call history is preserved. The guards below prevent new duplicate
-- active sessions without rewriting any existing rows.

create or replace function private.enforce_single_active_call()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.status = 'active' and exists (
    select 1
    from public.call_sessions existing
    where existing.id <> new.id
      and existing.status = 'active'
      and (
        (new.channel_id is not null and existing.channel_id = new.channel_id)
        or (new.conversation_id is not null and existing.conversation_id = new.conversation_id)
      )
  ) then
    raise exception 'an active call already exists for this room';
  end if;
  return new;
end;
$$;

drop trigger if exists call_sessions_one_active_guard on public.call_sessions;
create trigger call_sessions_one_active_guard
before insert or update of status, channel_id, conversation_id on public.call_sessions
for each row execute procedure private.enforce_single_active_call();

create or replace function private.enforce_single_active_call_participant()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.left_at is null and exists (
    select 1
    from public.call_participants existing
    where existing.call_id = new.call_id
      and existing.user_id = new.user_id
      and existing.left_at is null
      and existing.joined_at <> new.joined_at
  ) then
    raise exception 'participant is already active in this call';
  end if;
  return new;
end;
$$;

drop trigger if exists call_participants_one_active_guard on public.call_participants;
create trigger call_participants_one_active_guard
before insert or update of call_id, user_id, joined_at, left_at on public.call_participants
for each row execute procedure private.enforce_single_active_call_participant();

create or replace function public.authorize_livekit_voice_join(requested_channel_id uuid)
returns table (
  call_id uuid,
  room_name text,
  participant_name text,
  avatar_path text,
  max_participants integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  target_group_id uuid;
  target_call public.call_sessions%rowtype;
  target_profile public.profiles%rowtype;
  new_call_id uuid;
begin
  if current_user_id is null then raise exception 'You must be signed in.'; end if;
  if not private.is_email_verified(current_user_id) then raise exception 'Verify your email before joining voice.'; end if;

  select channel_row.group_id into target_group_id
  from public.channels channel_row
  where channel_row.id = requested_channel_id and channel_row.kind = 'voice';

  if target_group_id is null then raise exception 'Voice channel not found.'; end if;
  if not private.is_group_member(target_group_id, current_user_id) then raise exception 'You are not a member of this group.'; end if;
  if exists (
    select 1 from public.group_bans ban_row
    where ban_row.group_id = target_group_id
      and ban_row.user_id = current_user_id
      and (ban_row.expires_at is null or ban_row.expires_at > now())
  ) then
    raise exception 'You are not allowed to join this group.';
  end if;

  -- Serialize room creation without relying on client timing.
  perform pg_advisory_xact_lock(hashtextextended(requested_channel_id::text, 0));

  select session_row.* into target_call
  from public.call_sessions session_row
  where session_row.channel_id = requested_channel_id and session_row.status = 'active'
  order by session_row.started_at
  limit 1;

  if target_call.id is null then
    new_call_id := gen_random_uuid();
    insert into public.call_sessions (id, channel_id, started_by, provider_room_name, mode, status)
    values (
      new_call_id,
      requested_channel_id,
      current_user_id,
      'voice-' || replace(requested_channel_id::text, '-', '') || '-' || replace(new_call_id::text, '-', ''),
      'voice',
      'active'
    )
    returning * into target_call;
  end if;

  select profile_row.* into target_profile
  from public.profiles profile_row
  where profile_row.id = current_user_id and profile_row.deleted_at is null;
  if target_profile.id is null then raise exception 'Your profile is unavailable.'; end if;

  return query select target_call.id, target_call.provider_room_name,
    target_profile.display_name, target_profile.avatar_path, 25;
end;
$$;

revoke all on function public.authorize_livekit_voice_join(uuid) from public;
grant execute on function public.authorize_livekit_voice_join(uuid) to authenticated;

create or replace function public.record_livekit_participant_event(
  requested_room_name text,
  requested_user_id uuid,
  requested_event text,
  requested_microphone_muted boolean default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_call_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'service role required'; end if;
  if requested_event not in ('participant_joined', 'participant_left', 'room_finished', 'microphone_muted', 'microphone_unmuted') then
    raise exception 'unsupported LiveKit event';
  end if;

  select session_row.id into target_call_id
  from public.call_sessions session_row
  where session_row.provider_room_name = requested_room_name
  order by session_row.started_at desc
  limit 1;
  if target_call_id is null then return; end if;

  if requested_event = 'participant_joined' and requested_user_id is not null then
    update public.call_participants
      set left_at = now()
      where call_id = target_call_id and user_id = requested_user_id and left_at is null;
    insert into public.call_participants (call_id, user_id, microphone_muted)
      values (target_call_id, requested_user_id, coalesce(requested_microphone_muted, false));
    update public.call_sessions set status = 'active', ended_at = null where id = target_call_id;
  elsif requested_event = 'participant_left' and requested_user_id is not null then
    update public.call_participants
      set left_at = now()
      where call_id = target_call_id and user_id = requested_user_id and left_at is null;
    if not exists (select 1 from public.call_participants where call_id = target_call_id and left_at is null) then
      update public.call_sessions set status = 'ended', ended_at = now() where id = target_call_id;
    end if;
  elsif requested_event = 'room_finished' then
    update public.call_participants set left_at = coalesce(left_at, now()) where call_id = target_call_id;
    update public.call_sessions set status = 'ended', ended_at = coalesce(ended_at, now()) where id = target_call_id;
  elsif requested_user_id is not null then
    update public.call_participants
      set microphone_muted = coalesce(requested_microphone_muted, requested_event = 'microphone_muted')
      where call_id = target_call_id and user_id = requested_user_id and left_at is null;
  end if;
end;
$$;

revoke all on function public.record_livekit_participant_event(text, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.record_livekit_participant_event(text, uuid, text, boolean) to service_role;

-- Voice lifecycle writes now go through the trusted functions above.
drop policy if exists "Members start calls" on public.call_sessions;
drop policy if exists "Call starters update calls" on public.call_sessions;
drop policy if exists "Users manage their call presence" on public.call_participants;
