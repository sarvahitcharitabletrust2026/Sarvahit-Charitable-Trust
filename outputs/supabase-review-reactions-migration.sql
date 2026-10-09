create table if not exists public.trusted_review_reactions (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.trusted_reviews(id) on delete cascade,
  voter_id uuid not null,
  reaction text not null check (reaction in ('up', 'heart', 'down')),
  created_at timestamptz not null default now(),
  unique (review_id, voter_id)
);

alter table public.trusted_review_reactions enable row level security;

drop policy if exists "Allow public trusted review reaction read" on public.trusted_review_reactions;
create policy "Allow public trusted review reaction read"
on public.trusted_review_reactions for select to anon using (true);

drop policy if exists "Allow public trusted review reaction insert" on public.trusted_review_reactions;
create policy "Allow public trusted review reaction insert"
on public.trusted_review_reactions for insert to anon with check (true);

drop policy if exists "Allow public trusted review reaction delete" on public.trusted_review_reactions;
create policy "Allow public trusted review reaction delete"
on public.trusted_review_reactions for delete to anon using (true);

grant select, insert, delete on public.trusted_review_reactions to anon;

drop policy if exists "Allow admin panel trusted review rating update" on public.trusted_reviews;
revoke update on public.trusted_reviews from anon;
