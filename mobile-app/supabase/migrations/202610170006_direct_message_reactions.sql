-- Reactions for direct messages, with the same access model as the message.

create table if not exists public.direct_message_reactions (
  message_id uuid not null references public.direct_messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 20),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table public.direct_message_reactions enable row level security;

create policy "Conversation members view DM reactions"
on public.direct_message_reactions for select to authenticated
using (
  exists (
    select 1 from public.direct_messages message
    where message.id = message_id
      and private.is_conversation_member(message.conversation_id)
  )
);

create policy "Verified members add DM reactions"
on public.direct_message_reactions for insert to authenticated
with check (
  (select auth.uid()) = user_id
  and private.is_email_verified()
  and exists (
    select 1 from public.direct_messages message
    where message.id = message_id
      and private.is_conversation_member(message.conversation_id)
  )
);

create policy "Users remove their DM reactions"
on public.direct_message_reactions for delete to authenticated
using ((select auth.uid()) = user_id);

alter publication supabase_realtime add table public.direct_message_reactions;

create or replace function private.notify_direct_message_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recipient uuid; actor_name text;
begin
  select message.author_id into recipient
  from public.direct_messages message
  where message.id = new.message_id;
  if recipient is null or recipient = new.user_id then return new; end if;
  select display_name into actor_name from public.profiles where id = new.user_id;
  insert into public.notifications (user_id, actor_id, type, entity_type, entity_id, title, body)
  values (recipient, new.user_id, 'reaction', 'profile', new.user_id,
    coalesce(actor_name, 'Someone') || ' reacted ' || new.emoji,
    'Open your conversation to see the reaction.');
  return new;
end;
$$;

create trigger direct_message_reactions_create_notification
after insert on public.direct_message_reactions
for each row execute procedure private.notify_direct_message_reaction();
