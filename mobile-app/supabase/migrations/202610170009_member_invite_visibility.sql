-- Every group member may view the group's permanent primary invitation.

drop policy if exists "Group leaders view invites" on public.group_invites;
create policy "Group members view invites"
on public.group_invites for select to authenticated
using (private.is_group_member(group_id));
