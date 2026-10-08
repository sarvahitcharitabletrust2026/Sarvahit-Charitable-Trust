-- Run this once in the Supabase SQL Editor before using admin review ratings.
alter table public.trusted_reviews
  add column if not exists rating integer not null default 0;

drop policy if exists "Allow admin panel trusted review rating update" on public.trusted_reviews;
create policy "Allow admin panel trusted review rating update"
on public.trusted_reviews
for update
to anon
using (true)
with check (rating between 0 and 5);

revoke update on public.trusted_reviews from anon;
grant update (rating) on public.trusted_reviews to anon;
