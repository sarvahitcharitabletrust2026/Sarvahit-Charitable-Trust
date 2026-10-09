-- Run this in Supabase to keep visitor ratings and remove admin rating access.
alter table public.trusted_reviews
  add column if not exists rating integer not null default 0;

drop policy if exists "Allow admin panel trusted review rating update" on public.trusted_reviews;
revoke update on public.trusted_reviews from anon;
