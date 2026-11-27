-- Separate Drive, YouTube and Analytics OAuth grants.
begin;
create table if not exists public.media_google_provider_connections (
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider in ('drive', 'youtube', 'analytics')),
  encrypted_refresh text not null,
  email text not null,
  channel_id text,
  channel_name text,
  scopes text[] not null,
  updated_at timestamptz not null default now(),
  primary key (owner_id, provider)
);
alter table public.media_google_provider_connections enable row level security;
revoke all on public.media_google_provider_connections from public, anon, authenticated;
grant select, insert, update, delete on public.media_google_provider_connections to service_role;
commit;
