-- Repair auth accounts created before the public profile trigger existed.
-- The suffix keeps usernames deterministic and unique while respecting the
-- profiles username format and 24-character limit.
insert into public.profiles (id, username, display_name)
select
  users.id,
  (
    case
      when char_length(lower(regexp_replace(coalesce(users.raw_user_meta_data ->> 'username', ''), '[^a-z0-9_]', '', 'g'))) >= 3
        then left(lower(regexp_replace(users.raw_user_meta_data ->> 'username', '[^a-z0-9_]', '', 'g')), 15)
      else 'user'
    end
  ) || '_' || substr(users.id::text, 1, 8),
  left(coalesce(nullif(users.raw_user_meta_data ->> 'display_name', ''), split_part(users.email, '@', 1), 'New member'), 40)
from auth.users as users
where not exists (select 1 from public.profiles as profiles where profiles.id = users.id)
on conflict (id) do nothing;

-- Recreate the trigger defensively so future signups always receive a profile.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
