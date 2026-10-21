-- Privacy-aware type-ahead discovery for the Add Friend experience.

create or replace function public.search_people(search_text text, result_limit integer default 8)
returns table (
  id uuid,
  username text,
  display_name text,
  avatar_path text,
  status text,
  relationship_status text,
  request_direction text
)
language sql
stable
security definer
set search_path = ''
as $$
  with input as (
    select lower(trim(leading '@' from coalesce(search_text, ''))) as term,
           least(greatest(coalesce(result_limit, 8), 1), 10) as max_results,
           auth.uid() as viewer
  ), candidates as (
    select p.*, i.term, i.viewer,
      f.status as friendship_status,
      case
        when f.requester_id = i.viewer then 'outgoing'
        when f.addressee_id = i.viewer then 'incoming'
        else null
      end as direction,
      coalesce(pref.friend_request_privacy, 'everyone') as request_privacy
    from public.profiles p
    cross join input i
    left join public.friendships f on
      (f.requester_id = i.viewer and f.addressee_id = p.id)
      or (f.requester_id = p.id and f.addressee_id = i.viewer)
    left join public.user_preferences pref on pref.user_id = p.id
    where length(i.term) >= 2
      and p.id <> i.viewer
      and p.deleted_at is null
      and (lower(p.username) like '%' || i.term || '%' or lower(p.display_name) like '%' || i.term || '%')
      and not exists (
        select 1 from public.blocks b
        where (b.blocker_id = i.viewer and b.blocked_id = p.id)
           or (b.blocker_id = p.id and b.blocked_id = i.viewer)
      )
  )
  select c.id, c.username, c.display_name, c.avatar_path, c.status,
    c.friendship_status, c.direction
  from candidates c, input i
  where c.friendship_status is not null
     or c.request_privacy = 'everyone'
     or (c.request_privacy = 'shared_groups' and private.share_group(c.viewer, c.id))
  order by
    case when lower(c.username) = c.term then 0 when lower(c.username) like c.term || '%' then 1 else 2 end,
    c.username
  limit (select max_results from input);
$$;

revoke all on function public.search_people(text, integer) from public;
grant execute on function public.search_people(text, integer) to authenticated;
