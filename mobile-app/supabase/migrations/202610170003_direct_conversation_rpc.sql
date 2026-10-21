-- Create direct conversations atomically. The previous client flow could not
-- add its first member because RLS correctly required existing membership.

create or replace function public.get_or_create_direct_conversation(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  conversation_id uuid;
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;
  if other_user_id is null or other_user_id = current_user_id then
    raise exception 'Choose another person to message.';
  end if;
  if not private.is_email_verified(current_user_id) then
    raise exception 'Verify your email before sending messages.';
  end if;
  if not private.can_direct_message(current_user_id, other_user_id) then
    raise exception 'You can only message accepted friends or shared-group members.';
  end if;

  select conversation.id into conversation_id
  from public.direct_conversations conversation
  where conversation.kind = 'direct'
    and exists (select 1 from public.direct_conversation_members member where member.conversation_id = conversation.id and member.user_id = current_user_id)
    and exists (select 1 from public.direct_conversation_members member where member.conversation_id = conversation.id and member.user_id = other_user_id)
    and (select count(*) from public.direct_conversation_members member where member.conversation_id = conversation.id) = 2
  order by conversation.created_at
  limit 1;

  if conversation_id is null then
    insert into public.direct_conversations (created_by, kind)
    values (current_user_id, 'direct')
    returning id into conversation_id;

    insert into public.direct_conversation_members (conversation_id, user_id)
    values (conversation_id, current_user_id), (conversation_id, other_user_id);
  end if;

  return conversation_id;
end;
$$;

revoke all on function public.get_or_create_direct_conversation(uuid) from public;
grant execute on function public.get_or_create_direct_conversation(uuid) to authenticated;
