-- Expose only the accepted friends shared by the viewer and target user.
create or replace function public.get_mutual_friends(target_user_id uuid)
returns table (id uuid, username text, display_name text, avatar_path text, status text)
language plpgsql stable security definer set search_path = '' as $$
declare viewer_id uuid := auth.uid();
begin
  if viewer_id is null then raise exception 'You must be signed in.'; end if;
  if target_user_id is null then raise exception 'User not found.'; end if;
  if exists (select 1 from public.blocks block_row where (block_row.blocker_id = viewer_id and block_row.blocked_id = target_user_id) or (block_row.blocker_id = target_user_id and block_row.blocked_id = viewer_id)) then
    raise exception 'This profile is unavailable.';
  end if;
  return query
  with viewer_friends as (
    select case when friendship.requester_id = viewer_id then friendship.addressee_id else friendship.requester_id end as friend_id
    from public.friendships friendship where friendship.status = 'accepted' and viewer_id in (friendship.requester_id, friendship.addressee_id)
  ), target_friends as (
    select case when friendship.requester_id = target_user_id then friendship.addressee_id else friendship.requester_id end as friend_id
    from public.friendships friendship where friendship.status = 'accepted' and target_user_id in (friendship.requester_id, friendship.addressee_id)
  )
  select profile.id, profile.username, profile.display_name, profile.avatar_path, profile.status
  from viewer_friends join target_friends using (friend_id)
  join public.profiles profile on profile.id = viewer_friends.friend_id
  where profile.deleted_at is null order by profile.display_name limit 30;
end;
$$;
revoke all on function public.get_mutual_friends(uuid) from public;
grant execute on function public.get_mutual_friends(uuid) to authenticated;
