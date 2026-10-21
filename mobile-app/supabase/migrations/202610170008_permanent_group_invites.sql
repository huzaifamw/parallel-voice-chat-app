-- Every group owns one permanent primary invitation code.

alter table public.group_invites
  add column if not exists is_primary boolean not null default false;

update public.group_invites set is_primary = false;

with selected as (
  select distinct on (group_id) id
  from public.group_invites
  where revoked_at is null and expires_at is null and max_uses is null
  order by group_id, created_at
)
update public.group_invites invite
set is_primary = true
from selected
where invite.id = selected.id;

create unique index if not exists group_invites_one_primary_idx
on public.group_invites(group_id)
where is_primary;

insert into public.group_invites (group_id, created_by, code, is_primary)
select group_row.id, group_row.owner_id,
  left(coalesce(nullif(regexp_replace(lower(group_row.name), '[^a-z0-9]', '', 'g'), ''), 'group'), 16)
    || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
  true
from public.groups group_row
where not exists (
  select 1 from public.group_invites invite
  where invite.group_id = group_row.id and invite.is_primary
);

create or replace function private.create_primary_group_invite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.group_invites (group_id, created_by, code, is_primary)
  values (
    new.id,
    new.owner_id,
    left(coalesce(nullif(regexp_replace(lower(new.name), '[^a-z0-9]', '', 'g'), ''), 'group'), 16)
      || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10),
    true
  );
  return new;
end;
$$;

drop trigger if exists on_group_created_primary_invite on public.groups;
create trigger on_group_created_primary_invite
after insert on public.groups
for each row execute procedure private.create_primary_group_invite();

create or replace function public.get_group_invite_code(requested_group_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  invite_code text;
  group_owner uuid;
  group_name text;
begin
  if auth.uid() is null or not private.is_group_member(requested_group_id) then
    raise exception 'You must be a group member to view its invitation.';
  end if;

  select invite.code into invite_code
  from public.group_invites invite
  where invite.group_id = requested_group_id
    and invite.is_primary
    and invite.revoked_at is null
  limit 1;

  if invite_code is null then
    update public.group_invites set is_primary = false where group_id = requested_group_id and is_primary;
    select owner_id, name into group_owner, group_name from public.groups where id = requested_group_id;
    invite_code := left(coalesce(nullif(regexp_replace(lower(group_name), '[^a-z0-9]', '', 'g'), ''), 'group'), 16)
      || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    insert into public.group_invites (group_id, created_by, code, is_primary)
    values (requested_group_id, group_owner, invite_code, true);
  end if;

  return invite_code;
end;
$$;

revoke all on function public.get_group_invite_code(uuid) from public;
grant execute on function public.get_group_invite_code(uuid) to authenticated;
