-- Create a group and its starter channels as one atomic operation.

create or replace function public.create_group_with_defaults(
  requested_name text,
  requested_description text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  new_group_id uuid;
  clean_name text := trim(coalesce(requested_name, ''));
  clean_description text := trim(coalesce(requested_description, ''));
begin
  if current_user_id is null then
    raise exception 'You must be signed in.';
  end if;
  if not private.is_email_verified(current_user_id) then
    raise exception 'Verify your email before creating a group.';
  end if;
  if char_length(clean_name) < 1 or char_length(clean_name) > 80 then
    raise exception 'Group name must be between 1 and 80 characters.';
  end if;
  if char_length(clean_description) > 500 then
    raise exception 'Description must be 500 characters or fewer.';
  end if;

  insert into public.groups (owner_id, name, description, visibility)
  values (current_user_id, clean_name, clean_description, 'private')
  returning id into new_group_id;

  -- on_group_created adds the owner membership before these inserts run.
  insert into public.channels (group_id, created_by, name, kind, position)
  values
    (new_group_id, current_user_id, 'general', 'text', 0),
    (new_group_id, current_user_id, 'lounge', 'voice', 1);

  return new_group_id;
end;
$$;

revoke all on function public.create_group_with_defaults(text, text) from public;
grant execute on function public.create_group_with_defaults(text, text) to authenticated;
