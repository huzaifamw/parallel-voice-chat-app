-- Match lifecycle events to a specific LiveKit connection. This prevents a
-- delayed leave webhook from closing a newer connection for the same user.
alter table public.call_participants
  add column if not exists provider_participant_sid text;

create index if not exists call_participants_provider_sid_idx
  on public.call_participants(provider_participant_sid)
  where provider_participant_sid is not null;

create or replace function public.record_livekit_participant_event_v2(
  requested_room_name text,
  requested_user_id uuid,
  requested_participant_sid text,
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

  if requested_event = 'participant_joined' and requested_user_id is not null and requested_participant_sid is not null then
    update public.call_participants
      set left_at = now()
      where call_id = target_call_id and user_id = requested_user_id and left_at is null;
    insert into public.call_participants (call_id, user_id, microphone_muted, provider_participant_sid)
      values (target_call_id, requested_user_id, coalesce(requested_microphone_muted, false), requested_participant_sid);
    update public.call_sessions set status = 'active', ended_at = null where id = target_call_id;
  elsif requested_event = 'participant_left' and requested_participant_sid is not null then
    update public.call_participants
      set left_at = now()
      where call_id = target_call_id
        and provider_participant_sid = requested_participant_sid
        and left_at is null;
    if not exists (select 1 from public.call_participants where call_id = target_call_id and left_at is null) then
      update public.call_sessions set status = 'ended', ended_at = now() where id = target_call_id;
    end if;
  elsif requested_event = 'room_finished' then
    update public.call_participants set left_at = coalesce(left_at, now()) where call_id = target_call_id;
    update public.call_sessions set status = 'ended', ended_at = coalesce(ended_at, now()) where id = target_call_id;
  elsif requested_participant_sid is not null then
    update public.call_participants
      set microphone_muted = coalesce(requested_microphone_muted, requested_event = 'microphone_muted')
      where call_id = target_call_id
        and provider_participant_sid = requested_participant_sid
        and left_at is null;
  end if;
end;
$$;

revoke all on function public.record_livekit_participant_event_v2(text, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.record_livekit_participant_event_v2(text, uuid, text, text, boolean) to service_role;
