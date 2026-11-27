-- Public trust leadership profiles with admin-only changes.
-- Run after the trust finance admin migration that defines is_trust_finance_admin().
create table if not exists public.trust_team_members (
  member_position integer primary key check (member_position between 0 and 10),
  designation text not null check (length(trim(designation)) between 1 and 80),
  name text not null check (length(trim(name)) <= 100),
  photo_file_id text,
  photo_file_name text,
  updated_at timestamptz not null default now()
);

alter table public.trust_team_members enable row level security;
revoke all on public.trust_team_members from anon, authenticated;
grant select on public.trust_team_members to anon, authenticated;
grant insert, update, delete on public.trust_team_members to authenticated;

drop policy if exists "public reads trust team profiles" on public.trust_team_members;
create policy "public reads trust team profiles"
  on public.trust_team_members for select to anon, authenticated using (true);

drop policy if exists "finance admins manage trust team profiles" on public.trust_team_members;
create policy "finance admins manage trust team profiles"
  on public.trust_team_members for all to authenticated
  using (public.is_trust_finance_admin())
  with check (public.is_trust_finance_admin());
