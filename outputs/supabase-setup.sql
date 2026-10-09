create table if not exists public.volunteer_registrations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null,
  email text,
  city text not null,
  interest text not null,
  availability text not null,
  created_at timestamptz not null default now()
);

alter table public.volunteer_registrations
drop column if exists address;

alter table public.volunteer_registrations enable row level security;

drop policy if exists "Allow public volunteer registration" on public.volunteer_registrations;
create policy "Allow public volunteer registration"
on public.volunteer_registrations
for insert
to anon
with check (true);

drop policy if exists "Allow owner panel read for static site" on public.volunteer_registrations;
create policy "Allow owner panel read for static site"
on public.volunteer_registrations
for select
to anon
using (true);

drop policy if exists "Allow owner panel delete for static site" on public.volunteer_registrations;
create policy "Allow owner panel delete for static site"
on public.volunteer_registrations
for delete
to anon
using (true);

create table if not exists public.trusted_reviews (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  review text not null,
  rating integer not null default 0 check (rating between 0 and 5),
  created_at timestamptz not null default now()
);

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
create policy "Allow public trusted review reaction read" on public.trusted_review_reactions for select to anon using (true);
drop policy if exists "Allow public trusted review reaction insert" on public.trusted_review_reactions;
create policy "Allow public trusted review reaction insert" on public.trusted_review_reactions for insert to anon with check (true);
drop policy if exists "Allow public trusted review reaction delete" on public.trusted_review_reactions;
create policy "Allow public trusted review reaction delete" on public.trusted_review_reactions for delete to anon using (true);
grant select, insert, delete on public.trusted_review_reactions to anon;

alter table public.trusted_reviews
  add column if not exists rating integer not null default 0;

alter table public.trusted_reviews enable row level security;

drop policy if exists "Allow public trusted review submission" on public.trusted_reviews;
create policy "Allow public trusted review submission"
on public.trusted_reviews
for insert
to anon
with check (true);

drop policy if exists "Allow admin panel trusted review read" on public.trusted_reviews;
create policy "Allow admin panel trusted review read"
on public.trusted_reviews
for select
to anon
using (true);

drop policy if exists "Allow admin panel trusted review delete" on public.trusted_reviews;
create policy "Allow admin panel trusted review delete"
on public.trusted_reviews
for delete
to anon
using (true);

revoke update on public.trusted_reviews from anon;
grant update (rating) on public.trusted_reviews to anon;

create table if not exists public.trust_impact_stats (
  id text primary key default 'main',
  food_packets integer not null default 0,
  students_supported integer not null default 0,
  medical_cases integer not null default 0,
  notice_title text not null default 'Notice',
  notice_message text not null default 'New food distribution and education support activities will be announced here.',
  updated_at timestamptz not null default now()
);

alter table public.trust_impact_stats
add column if not exists notice_title text not null default 'Notice';

alter table public.trust_impact_stats
add column if not exists notice_message text not null default 'New food distribution and education support activities will be announced here.';

insert into public.trust_impact_stats (id, food_packets, students_supported, medical_cases)
values ('main', 0, 0, 0)
on conflict (id) do nothing;

alter table public.trust_impact_stats enable row level security;

drop policy if exists "Allow public impact stats read" on public.trust_impact_stats;
create policy "Allow public impact stats read"
on public.trust_impact_stats
for select
to anon
using (true);

drop policy if exists "Allow admin impact stats update" on public.trust_impact_stats;
create policy "Allow admin impact stats update"
on public.trust_impact_stats
for insert
to anon
with check (true);

drop policy if exists "Allow admin impact stats upsert update" on public.trust_impact_stats;
create policy "Allow admin impact stats upsert update"
on public.trust_impact_stats
for update
to anon
using (true)
with check (true);

create table if not exists public.donation_records (
  id uuid primary key default gen_random_uuid(),
  donor_name text not null,
  email text not null,
  phone text not null check (phone ~ '^[0-9]{10}$'),
  city text not null,
  amount numeric(12, 2) not null check (amount > 0),
  purpose text not null,
  screenshot_path text not null,
  screenshot_file_name text,
  screenshot_mime_type text,
  screenshot_storage text not null default 'supabase',
  drive_file_url text,
  drive_folder_year text,
  payment_status text not null default 'submitted',
  certificate_id text not null unique,
  created_at timestamptz not null default now()
);

alter table public.donation_records add column if not exists screenshot_file_name text;
alter table public.donation_records add column if not exists pan_card_number text;
alter table public.donation_records add column if not exists screenshot_mime_type text;
alter table public.donation_records add column if not exists screenshot_storage text not null default 'supabase';
alter table public.donation_records add column if not exists drive_file_url text;
alter table public.donation_records add column if not exists drive_folder_year text;

alter table public.donation_records enable row level security;

drop policy if exists "Allow public donation submission" on public.donation_records;
create policy "Allow public donation submission"
on public.donation_records
for insert
to anon
with check (payment_status = 'submitted');

drop policy if exists "Allow admin donation records read" on public.donation_records;
create policy "Allow admin donation records read"
on public.donation_records
for select
to anon
using (true);

insert into storage.buckets (id, name, public)
values ('payment-screenshots', 'payment-screenshots', false)
on conflict (id) do update set public = false;

drop policy if exists "Allow public payment screenshot upload" on storage.objects;
create policy "Allow public payment screenshot upload"
on storage.objects
for insert
to anon
with check (bucket_id = 'payment-screenshots');

drop policy if exists "Allow admin payment screenshot read" on storage.objects;
create policy "Allow admin payment screenshot read"
on storage.objects
for select
to anon
using (bucket_id = 'payment-screenshots');
