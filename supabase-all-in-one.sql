-- SARVAHIT TRUST: SINGLE SUPABASE SETUP
-- Run this complete file once in Supabase SQL Editor. Safe to rerun on the same project.
-- It includes the setup and all prior migrations in dependency order.
--
-- Ensure a Dashboard SQL Editor session is not left in a restricted role.
reset role;

-- ============================================================================
-- Included: supabase-setup.sql
-- ============================================================================
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
  drive_folder_month text,
  drive_folder_day text,
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
alter table public.donation_records add column if not exists drive_folder_month text;
alter table public.donation_records add column if not exists drive_folder_day text;

alter table public.donation_records enable row level security;

drop policy if exists "Allow public donation submission" on public.donation_records;
create policy "Allow public donation submission"
on public.donation_records
for insert
to anon, authenticated
with check (payment_status = 'submitted');

drop policy if exists "Allow admin donation records read" on public.donation_records;
create policy "Allow admin donation records read"
on public.donation_records
for select
to anon
using (true);

do $storage$
declare can_manage_storage boolean := false;
begin
  select exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
      and (c.relowner = (select oid from pg_roles where rolname = current_user)
        or coalesce((select rolsuper from pg_roles where rolname = current_user), false))
  ) into can_manage_storage;
  if can_manage_storage then
    execute $ddl$insert into storage.buckets (id, name, public) values ('payment-screenshots', 'payment-screenshots', false) on conflict (id) do update set public = false$ddl$;
    execute $ddl$drop policy if exists "Allow public payment screenshot upload" on storage.objects$ddl$;
    execute $ddl$create policy "Allow public payment screenshot upload" on storage.objects for insert to anon with check (bucket_id = 'payment-screenshots')$ddl$;
    execute $ddl$drop policy if exists "Allow admin payment screenshot read" on storage.objects$ddl$;
    execute $ddl$create policy "Allow admin payment screenshot read" on storage.objects for select to anon using (bucket_id = 'payment-screenshots')$ddl$;
  else
    raise notice 'Skipped storage.objects setup because the current role is not its owner. Run storage setup as the table owner if these policies need changes.';
  end if;
end
$storage$;
-- ============================================================================
-- Included: supabase-review-rating-migration.sql
-- ============================================================================
-- Run this in Supabase to keep visitor ratings and remove admin rating access.
alter table public.trusted_reviews
  add column if not exists rating integer not null default 0;

drop policy if exists "Allow admin panel trusted review rating update" on public.trusted_reviews;
revoke update on public.trusted_reviews from anon;


-- ============================================================================
-- Included: supabase-review-reactions-migration.sql
-- ============================================================================
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


-- ============================================================================
-- Included: supabase-transparency-migration.sql
-- ============================================================================
-- Financial transparency ledger. Run after supabase-setup.sql.
-- Public receives only grouped totals. Donor details, references and proofs stay private.
create table if not exists public.trust_finance_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.trust_finance_admins enable row level security;
revoke all on public.trust_finance_admins from anon, authenticated;

create or replace function public.is_trust_finance_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.trust_finance_admins where user_id = auth.uid()); $$;
revoke all on function public.is_trust_finance_admin() from public;
grant execute on function public.is_trust_finance_admin() to authenticated;

create table if not exists public.trust_financial_entries (
  id uuid primary key default gen_random_uuid(),
  entry_type text not null check (entry_type in ('donation','expense','opening_balance')),
  entry_date date not null,
  amount numeric(14,2) not null check (amount > 0),
  category text not null,
  fund_type text not null default 'unrestricted' check (fund_type in ('unrestricted','restricted')),
  fund_name text,
  public_note text,
  donor_name text,
  donor_email text,
  donor_phone text,
  bank_reference text,
  attachment_path text,
  reconciliation_status text not null default 'unreconciled' check (reconciliation_status in ('unreconciled','matched','exception')),
  workflow_status text not null default 'draft' check (workflow_status in ('draft','pending','approved','published')),
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.trust_financial_entries add column if not exists payment_method text;
alter table public.trust_financial_entries add column if not exists attachment_drive_url text;
alter table public.trust_financial_entries add column if not exists attachment_drive_file_id text;
alter table public.donation_records add column if not exists drive_folder_month text;
alter table public.donation_records add column if not exists drive_folder_day text;
alter table public.trust_financial_entries enable row level security;
revoke all on public.trust_financial_entries from anon;
grant select, insert, update, delete on public.trust_financial_entries to authenticated;
drop policy if exists "finance admin manages entries" on public.trust_financial_entries;
create policy "finance admin manages entries" on public.trust_financial_entries
  for all to authenticated using (public.is_trust_finance_admin()) with check (public.is_trust_finance_admin());

create table if not exists public.trust_finance_audit (
  id bigint generated always as identity primary key,
  entry_id uuid not null,
  action text not null,
  changed_by uuid not null default auth.uid(),
  changed_at timestamptz not null default now(),
  old_record jsonb,
  new_record jsonb
);
alter table public.trust_finance_audit enable row level security;
revoke all on public.trust_finance_audit from anon, authenticated;
grant select on public.trust_finance_audit to authenticated;
drop policy if exists "finance admin reads audit" on public.trust_finance_audit;
create policy "finance admin reads audit" on public.trust_finance_audit for select to authenticated using (public.is_trust_finance_admin());

create or replace function public.audit_trust_financial_entry()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.workflow_status = 'published' then raise exception 'A financial entry must be approved before publication'; end if;
    insert into public.trust_finance_audit(entry_id, action, new_record) values(new.id, 'insert', to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if new.workflow_status = 'published' and old.workflow_status <> 'approved' and old.workflow_status <> 'published' then
      raise exception 'A financial entry must be approved before publication';
    end if;
    new.updated_at = now(); new.updated_by = auth.uid();
    insert into public.trust_finance_audit(entry_id, action, old_record, new_record) values(new.id, 'update', to_jsonb(old), to_jsonb(new));
    return new;
  else
    insert into public.trust_finance_audit(entry_id, action, old_record) values(old.id, 'delete', to_jsonb(old));
    return old;
  end if;
end $$;
drop trigger if exists trust_financial_entries_audit on public.trust_financial_entries;
create trigger trust_financial_entries_audit before insert or update or delete on public.trust_financial_entries for each row execute function public.audit_trust_financial_entry();

-- Public aggregate view: no donor names, contact details, bank references, proofs, or individual rows.
create or replace view public.trust_finance_public_summary with (security_barrier = true) as
select date_trunc('month', entry_date)::date as month_start,
  extract(year from entry_date)::integer as calendar_year,
  case when extract(month from entry_date) >= 4 then extract(year from entry_date)::integer else extract(year from entry_date)::integer - 1 end as financial_year_start,
  entry_type, fund_type, category, sum(amount)::numeric(14,2) as total_amount
from public.trust_financial_entries
where workflow_status = 'published'
group by 1,2,3,4,5,6
union all
select date_trunc('month', created_at at time zone 'Asia/Kolkata')::date as month_start,
  extract(year from created_at at time zone 'Asia/Kolkata')::integer as calendar_year,
  case when extract(month from created_at at time zone 'Asia/Kolkata') >= 4 then extract(year from created_at at time zone 'Asia/Kolkata')::integer else extract(year from created_at at time zone 'Asia/Kolkata')::integer - 1 end as financial_year_start,
  'donation'::text as entry_type, 'unrestricted'::text as fund_type, purpose as category, sum(amount)::numeric(14,2) as total_amount
from public.donation_records
where payment_status = 'published'
group by 1,2,3,4,5,6;
revoke all on public.trust_finance_public_summary from public;
grant select on public.trust_finance_public_summary to anon, authenticated;

do $storage$
declare can_manage_storage boolean := false;
begin
  select exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
      and (c.relowner = (select oid from pg_roles where rolname = current_user)
        or coalesce((select rolsuper from pg_roles where rolname = current_user), false))
  ) into can_manage_storage;
  if can_manage_storage then
    execute $ddl$insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values ('trust-finance-private','trust-finance-private',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp']) on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types$ddl$;
    execute $ddl$drop policy if exists "finance admin storage access" on storage.objects$ddl$;
    execute $ddl$create policy "finance admin storage access" on storage.objects for all to authenticated using (bucket_id = 'trust-finance-private' and public.is_trust_finance_admin()) with check (bucket_id = 'trust-finance-private' and public.is_trust_finance_admin())$ddl$;
  else
    raise notice 'Skipped storage.objects setup because the current role is not its owner. Run storage setup as the table owner if these policies need changes.';
  end if;
end
$storage$;
-- Close the existing anonymous exposure of donor records and proof objects.
drop policy if exists "Allow admin donation records read" on public.donation_records;


drop policy if exists "Allow public donation submission" on public.donation_records;
create policy "Allow public donation submission" on public.donation_records
  for insert to anon, authenticated with check (payment_status = 'submitted');
grant insert on public.donation_records to anon, authenticated;
drop policy if exists "finance admins read donation records" on public.donation_records;
drop policy if exists "finance admins update donation records" on public.donation_records;
drop policy if exists "finance admins delete donation records" on public.donation_records;


create policy "finance admins read donation records" on public.donation_records for select to authenticated using (public.is_trust_finance_admin());
create policy "finance admins update donation records" on public.donation_records for update to authenticated using (public.is_trust_finance_admin()) with check (public.is_trust_finance_admin());
create policy "finance admins delete donation records" on public.donation_records for delete to authenticated using (public.is_trust_finance_admin());
grant select, update, delete on public.donation_records to authenticated;
do $storage$
declare can_manage_storage boolean := false;
begin
  select exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
      and (c.relowner = (select oid from pg_roles where rolname = current_user)
        or coalesce((select rolsuper from pg_roles where rolname = current_user), false))
  ) into can_manage_storage;
  if can_manage_storage then
    execute $ddl$drop policy if exists "Allow admin payment screenshot read" on storage.objects$ddl$;
    execute $ddl$drop policy if exists "finance admins read payment screenshots" on storage.objects$ddl$;
    execute $ddl$create policy "finance admins read payment screenshots" on storage.objects for select to authenticated using (bucket_id = 'payment-screenshots' and public.is_trust_finance_admin())$ddl$;
  else
    raise notice 'Skipped storage.objects policy changes because the current role is not its owner.';
  end if;
end
$storage$;


-- Replace insecure public admin CRUD policies on existing admin data.
drop policy if exists "Allow owner panel read for static site" on public.volunteer_registrations;
drop policy if exists "Allow owner panel delete for static site" on public.volunteer_registrations;
drop policy if exists "finance admins read volunteers" on public.volunteer_registrations;
drop policy if exists "finance admins delete volunteers" on public.volunteer_registrations;
create policy "finance admins read volunteers" on public.volunteer_registrations for select to authenticated using (public.is_trust_finance_admin());
create policy "finance admins delete volunteers" on public.volunteer_registrations for delete to authenticated using (public.is_trust_finance_admin());
grant insert on public.volunteer_registrations to anon, authenticated;
grant select, delete on public.volunteer_registrations to authenticated;
create or replace function public.trust_public_volunteer_count()
returns bigint language sql stable security definer set search_path = public
as 'select count(*)::bigint from public.volunteer_registrations';
revoke all on function public.trust_public_volunteer_count() from public;
grant execute on function public.trust_public_volunteer_count() to anon, authenticated;
drop policy if exists "Allow admin panel trusted review read" on public.trusted_reviews;
drop policy if exists "Allow admin panel trusted review delete" on public.trusted_reviews;
drop policy if exists "finance admins read reviews" on public.trusted_reviews;
drop policy if exists "finance admins delete reviews" on public.trusted_reviews;
create policy "finance admins read reviews" on public.trusted_reviews for select to authenticated using (public.is_trust_finance_admin());
create policy "finance admins delete reviews" on public.trusted_reviews for delete to authenticated using (public.is_trust_finance_admin());
grant insert on public.trusted_reviews to anon;
create or replace view public.trust_public_reviews with (security_barrier = true) as
select id, name, review, rating, created_at from public.trusted_reviews;
revoke all on public.trust_public_reviews from public;
grant select on public.trust_public_reviews to anon, authenticated;
drop policy if exists "Allow public impact stats read" on public.trust_impact_stats;
drop policy if exists "Allow admin impact stats update" on public.trust_impact_stats;
drop policy if exists "Allow admin impact stats upsert update" on public.trust_impact_stats;
drop policy if exists "public reads impact stats" on public.trust_impact_stats;
drop policy if exists "finance admins manage impact stats" on public.trust_impact_stats;
create policy "public reads impact stats" on public.trust_impact_stats for select to anon, authenticated using (true);
create policy "finance admins manage impact stats" on public.trust_impact_stats for all to authenticated using (public.is_trust_finance_admin()) with check (public.is_trust_finance_admin());


-- Return a period-based count of published donation records to match the public impact metric. No donor details are exposed.
create or replace function public.trust_public_donor_count(p_start date, p_end date)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from (
    select coalesce(
      'email:' || lower(nullif(btrim(email), '')),
      'phone:' || nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), ''),
      'name:' || lower(nullif(btrim(donor_name), ''))
    ) as donor_key
    from public.donation_records
    where payment_status = 'published'
      and created_at >= (p_start::timestamp at time zone 'Asia/Kolkata')
      and created_at < (p_end::timestamp at time zone 'Asia/Kolkata')

    union all

    select coalesce(
      'email:' || lower(nullif(btrim(donor_email), '')),
      'name-phone:' || lower(nullif(btrim(donor_name), '')) || '|' || nullif(regexp_replace(coalesce(donor_phone, ''), '\D', '', 'g'), ''),
      'phone:' || nullif(regexp_replace(coalesce(donor_phone, ''), '\D', '', 'g'), ''),
      'name:' || lower(nullif(btrim(donor_name), ''))
    ) as donor_key
    from public.trust_financial_entries
    where entry_type = 'donation'
      and workflow_status = 'published'
      and entry_date >= p_start
      and entry_date < p_end
  ) as public_donors
;
$$;
revoke all on function public.trust_public_donor_count(date, date) from public;
grant execute on function public.trust_public_donor_count(date, date) to anon, authenticated;

-- ============================================================================
-- Included: supabase-pan-name-migration.sql
-- ============================================================================
alter table public.donation_records
add column if not exists pan_card_number text;


-- ============================================================================
-- Included: supabase-drive-upload-migration.sql
-- ============================================================================
-- Run after supabase-transparency-migration.sql when updating an existing site.
alter table public.trust_financial_entries add column if not exists payment_method text;
alter table public.trust_financial_entries add column if not exists attachment_drive_url text;
alter table public.trust_financial_entries add column if not exists attachment_drive_file_id text;
alter table public.donation_records add column if not exists drive_folder_month text;
alter table public.donation_records add column if not exists drive_folder_day text;

-- ============================================================================
-- Included: supabase-donation-count-function.sql
-- ============================================================================
-- Return a period-based count of published donation records to match the public impact metric. No donor details are exposed.
create or replace function public.trust_public_donor_count(p_start date, p_end date)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from (
    select coalesce(
      'email:' || lower(nullif(btrim(email), '')),
      'phone:' || nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), ''),
      'name:' || lower(nullif(btrim(donor_name), ''))
    ) as donor_key
    from public.donation_records
    where payment_status = 'published'
      and created_at >= (p_start::timestamp at time zone 'Asia/Kolkata')
      and created_at < (p_end::timestamp at time zone 'Asia/Kolkata')

    union all

    select coalesce(
      'email:' || lower(nullif(btrim(donor_email), '')),
      'name-phone:' || lower(nullif(btrim(donor_name), '')) || '|' || nullif(regexp_replace(coalesce(donor_phone, ''), '\D', '', 'g'), ''),
      'phone:' || nullif(regexp_replace(coalesce(donor_phone, ''), '\D', '', 'g'), ''),
      'name:' || lower(nullif(btrim(donor_name), ''))
    ) as donor_key
    from public.trust_financial_entries
    where entry_type = 'donation'
      and workflow_status = 'published'
      and entry_date >= p_start
      and entry_date < p_end
  ) as public_donors
;
$$;
revoke all on function public.trust_public_donor_count(date, date) from public;
grant execute on function public.trust_public_donor_count(date, date) to anon, authenticated;

-- ============================================================================
-- Included: supabase-donation-submit-policy-fix.sql
-- ============================================================================
-- Restore public donor submission after the finance security migration.
-- Donors can insert only rows marked submitted. Private records remain unreadable.
drop policy if exists "Allow public donation submission" on public.donation_records;
create policy "Allow public donation submission"
on public.donation_records
for insert
to anon, authenticated
with check (payment_status = 'submitted');

grant insert on public.donation_records to anon, authenticated;


-- Ensure the public donation-submit policy cannot be blocked by stale/restrictive policies.
alter table public.donation_records enable row level security;
do $$
declare stale_policy record;
begin
  for stale_policy in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'donation_records' and cmd in ('INSERT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.donation_records', stale_policy.policyname);
  end loop;
end $$;
create policy "Allow public donation submission" on public.donation_records
  for insert to anon, authenticated with check (payment_status = 'submitted');
grant insert on public.donation_records to anon, authenticated;

-- Ensure anonymous donors may upload payment proof into this private bucket only.
-- Supabase storage.objects is managed; adjust its policies only when running as its owner.
do $storage$
declare
  can_manage_storage boolean := false;
  stale_policy record;
begin
  select exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'storage' and c.relname = 'objects'
      and (c.relowner = (select oid from pg_roles where rolname = current_user)
        or coalesce((select rolsuper from pg_roles where rolname = current_user), false))
  ) into can_manage_storage;
  if can_manage_storage then
    execute 'alter table storage.objects enable row level security';
    for stale_policy in
      select policyname from pg_policies
      where schemaname = 'storage' and tablename = 'objects'
        and cmd in ('INSERT', 'ALL')
        and coalesce(with_check, '') like '%payment-screenshots%'
    loop
      execute format('drop policy if exists %I on storage.objects', stale_policy.policyname);
    end loop;
    execute $ddl$drop policy if exists "Allow public payment screenshot upload" on storage.objects$ddl$;
    execute $ddl$create policy "Allow public payment screenshot upload" on storage.objects for insert to anon with check (bucket_id = 'payment-screenshots')$ddl$;
    execute $ddl$grant insert on storage.objects to anon$ddl$;
  else
    raise notice 'Skipped storage.objects policy changes because the current role is not its owner.';
  end if;
end
$storage$;
-- Final consolidated donation submission and public count policy.
-- Allow online donations to submit only records marked as submitted.
alter table public.donation_records enable row level security;
do $$
declare stale_policy record;
begin
  for stale_policy in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'donation_records'
      and cmd in ('INSERT', 'ALL')
  loop
    execute format('drop policy if exists %I on public.donation_records', stale_policy.policyname);
  end loop;
end $$;
create policy "Allow public donation submission"
  on public.donation_records
  for insert to anon, authenticated
  with check (payment_status = 'submitted');
grant insert on public.donation_records to anon, authenticated;

-- Count published online submissions and manual ledger donations for the public impact metric.
-- Only the aggregate count is returned; donor details remain private.
create or replace function public.trust_public_donor_count(p_start date, p_end date)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint
  from (
    select coalesce(
      'email:' || lower(nullif(btrim(email), '')),
      'phone:' || nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), ''),
      'name:' || lower(nullif(btrim(donor_name), ''))
    ) as donor_key
    from public.donation_records
    where payment_status = 'published'
      and created_at >= (p_start::timestamp at time zone 'Asia/Kolkata')
      and created_at < (p_end::timestamp at time zone 'Asia/Kolkata')

    union all

    select coalesce(
      'email:' || lower(nullif(btrim(donor_email), '')),
      'name-phone:' || lower(nullif(btrim(donor_name), '')) || '|' || nullif(regexp_replace(coalesce(donor_phone, ''), '\D', '', 'g'), ''),
      'phone:' || nullif(regexp_replace(coalesce(donor_phone, ''), '\D', '', 'g'), ''),
      'name:' || lower(nullif(btrim(donor_name), ''))
    ) as donor_key
    from public.trust_financial_entries
    where entry_type = 'donation'
      and workflow_status = 'published'
      and entry_date >= p_start
      and entry_date < p_end
  ) as public_donors
;
$$;
revoke all on function public.trust_public_donor_count(date, date) from public;
grant execute on function public.trust_public_donor_count(date, date) to anon, authenticated;
alter table public.donation_records
  add column if not exists certificate_delivery text[] not null default '{}';

alter table public.donation_records
  add column if not exists certificate_delivery_status jsonb not null default '{}'::jsonb;

alter table public.donation_records
  add column if not exists eighty_g_certificate_status text,
  add column if not exists eighty_g_certificate_url text;

alter table public.trust_financial_entries
  add column if not exists eighty_g_certificate_status text,
  add column if not exists eighty_g_certificate_url text;

-- ============================================================================
-- Included: supabase-team-members-migration.sql
-- ============================================================================
create table if not exists public.trust_team_members (
  member_position integer primary key check (member_position between 0 and 10),
  designation text not null check (length(trim(designation)) between 1 and 80),
  name text not null check (length(trim(name)) <= 100),
  contact text,
  email text,
  pan text,
  address text,
  contribution text,
  photo_file_id text,
  photo_file_name text,
  updated_at timestamptz not null default now()
);
alter table public.trust_team_members add column if not exists contact text;
alter table public.trust_team_members add column if not exists email text;
alter table public.trust_team_members add column if not exists pan text;
alter table public.trust_team_members add column if not exists address text;
alter table public.trust_team_members add column if not exists contribution text;

alter table public.trust_team_members enable row level security;
revoke all on public.trust_team_members from anon, authenticated;
grant select on public.trust_team_members to authenticated;
grant insert, update, delete on public.trust_team_members to authenticated;

drop policy if exists "public reads trust team profiles" on public.trust_team_members;
drop policy if exists "finance admins read trust team profiles" on public.trust_team_members;
create policy "finance admins read trust team profiles"
  on public.trust_team_members for select to authenticated using (public.is_trust_finance_admin());

drop policy if exists "finance admins manage trust team profiles" on public.trust_team_members;
create policy "finance admins manage trust team profiles"
  on public.trust_team_members for all to authenticated
  using (public.is_trust_finance_admin())
  with check (public.is_trust_finance_admin());

create or replace view public.trust_team_members_public with (security_barrier = true) as
select member_position, designation, name, photo_file_id, photo_file_name, updated_at
from public.trust_team_members;
revoke all on public.trust_team_members_public from public;
grant select on public.trust_team_members_public to anon, authenticated;

-- ============================================================================
-- Included: supabase-trustee-portal-and-partners-migration.sql
-- ============================================================================
-- Create each trustee email/password first in Supabase Authentication > Users.
alter table public.trust_impact_stats add column if not exists awareness_drives integer not null default 0;
alter table public.trust_impact_stats add column if not exists tree_plantations integer not null default 0;
alter table public.trust_impact_stats add column if not exists community_welfare integer not null default 0;
alter table public.trust_financial_entries add column if not exists submitted_by_name text;
alter table public.donation_records add column if not exists submitted_by_name text;

create table if not exists public.trust_portal_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) between 2 and 100),
  role text not null check (role in ('founder', 'secretary', 'treasurer', 'trustee')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.trust_portal_profiles enable row level security;
alter table public.trust_portal_profiles drop constraint if exists trust_portal_profiles_role_check;
alter table public.trust_portal_profiles add constraint trust_portal_profiles_role_check check (role in ('founder', 'secretary', 'treasurer', 'trustee'));
revoke all on public.trust_portal_profiles from anon, authenticated;

create or replace function public.is_trust_portal_user()
returns boolean language sql stable security definer set search_path = public
as $$ select public.is_trust_finance_admin() or exists (select 1 from public.trust_portal_profiles where user_id = auth.uid()); $$;
revoke all on function public.is_trust_portal_user() from public;
grant execute on function public.is_trust_portal_user() to authenticated;

create or replace function public.is_trustee()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.trust_portal_profiles where user_id = auth.uid() and role in ('secretary', 'treasurer', 'trustee')); $$;
revoke all on function public.is_trustee() from public;
grant execute on function public.is_trustee() to authenticated;

create or replace function public.is_trust_founder()
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.trust_portal_profiles where user_id = auth.uid() and role = 'founder'); $$;
revoke all on function public.is_trust_founder() from public;
grant execute on function public.is_trust_founder() to authenticated;

create or replace function public.trust_portal_identity()
returns jsonb language sql stable security definer set search_path = public
as $$
  select case when public.is_trust_finance_admin() then jsonb_build_object('role','admin','name',coalesce((select full_name from public.trust_portal_profiles where role = 'founder' order by created_at asc limit 1), auth.jwt() ->> 'email','Admin'))
    else coalesce((select jsonb_build_object('role', role, 'name', full_name) from public.trust_portal_profiles where user_id = auth.uid()), '{}'::jsonb) end;
$$;
revoke all on function public.trust_portal_identity() from public;
grant execute on function public.trust_portal_identity() to authenticated;

-- Passwords are handled only by Supabase Authentication, never in this table.
create or replace function public.set_trust_portal_user(p_email text, p_full_name text, p_role text)
returns void language plpgsql security definer set search_path = public, auth
as $$
declare target_id uuid;
begin
  if not public.is_trust_finance_admin() then raise exception 'Only a finance admin can manage trustee access'; end if;
  select id into target_id from auth.users where lower(email) = lower(btrim(p_email));
  if target_id is null then raise exception 'Create this email in Supabase Authentication first'; end if;
  if p_role not in ('founder','secretary','treasurer','trustee') then raise exception 'Invalid portal role'; end if;
  insert into public.trust_portal_profiles(user_id, full_name, role) values (target_id, btrim(p_full_name), p_role)
  on conflict (user_id) do update set full_name = excluded.full_name, role = excluded.role, updated_at = now();
end $$;
revoke all on function public.set_trust_portal_user(text, text, text) from public;
grant execute on function public.set_trust_portal_user(text, text, text) to authenticated;

alter table public.trust_financial_entries drop constraint if exists trust_financial_entries_workflow_status_check;
alter table public.trust_financial_entries add constraint trust_financial_entries_workflow_status_check check (workflow_status in ('draft','pending','approved','published'));

create or replace function public.set_finance_submitter()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.submitted_by_name := case
      when public.is_trust_finance_admin() then 'Admin'
      else coalesce((select full_name from public.trust_portal_profiles where user_id = auth.uid()), auth.jwt() ->> 'email', 'Trust admin')
    end;
  end if;
  return new;
end $$;
drop trigger if exists trust_finance_submitter on public.trust_financial_entries;
create trigger trust_finance_submitter before insert on public.trust_financial_entries for each row execute function public.set_finance_submitter();

drop policy if exists "trustees read finance entries" on public.trust_financial_entries;
drop policy if exists "trustees add finance entries" on public.trust_financial_entries;
create policy "trustees read finance entries" on public.trust_financial_entries for select to authenticated using (public.is_trust_portal_user());
create policy "trustees add finance entries" on public.trust_financial_entries for insert to authenticated with check (public.is_trust_portal_user());
drop policy if exists "portal members submit financial entries" on public.trust_financial_entries;
create policy "portal members submit financial entries" on public.trust_financial_entries for insert to authenticated with check (public.is_trust_portal_user());
drop policy if exists "portal members upload finance receipts" on storage.objects;
create policy "portal members upload finance receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'trust-finance-private' and public.is_trust_portal_user());
drop policy if exists "founders manage finance entries" on public.trust_financial_entries;
drop policy if exists "founders delete finance entries" on public.trust_financial_entries;
create policy "founders manage finance entries" on public.trust_financial_entries for update to authenticated using (public.is_trust_founder()) with check (public.is_trust_founder());
create policy "founders delete finance entries" on public.trust_financial_entries for delete to authenticated using (public.is_trust_founder());
drop policy if exists "trustees read donation records" on public.donation_records;
create policy "trustees read donation records" on public.donation_records for select to authenticated using (public.is_trust_portal_user());
drop policy if exists "founders manage donation records" on public.donation_records;
drop policy if exists "founders delete donation records" on public.donation_records;
create policy "founders manage donation records" on public.donation_records for update to authenticated using (public.is_trust_founder()) with check (public.is_trust_founder());
create policy "founders delete donation records" on public.donation_records for delete to authenticated using (public.is_trust_founder());
drop policy if exists "trustees read volunteers" on public.volunteer_registrations;
create policy "trustees read volunteers" on public.volunteer_registrations for select to authenticated using (public.is_trust_portal_user());

create table if not exists public.trust_partners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  logo_url text,
  website_url text,
  description text,
  sort_order bigint not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.trust_partners add column if not exists logo_url text;
alter table public.trust_partners enable row level security;
revoke all on public.trust_partners from anon;
grant select on public.trust_partners to anon, authenticated;
grant insert, update, delete on public.trust_partners to authenticated;
drop policy if exists "public reads published partners" on public.trust_partners;
create policy "public reads published partners" on public.trust_partners for select to anon, authenticated using (is_published or public.is_trust_finance_admin());
drop policy if exists "admins manage partners" on public.trust_partners;
create policy "admins manage partners" on public.trust_partners for all to authenticated using (public.is_trust_finance_admin()) with check (public.is_trust_finance_admin());

-- Partner form and portal permissions update
begin;

alter table public.trust_partners
  add column if not exists category text,
  add column if not exists about_organization text,
  add column if not exists contact_person text,
  add column if not exists contact_designation text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists full_address text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists collaboration_type text,
  add column if not exists partnership_start_date date,
  add column if not exists partnership_end_date date,
  add column if not exists featured boolean not null default false,
  add column if not exists partner_permission boolean not null default false,
  add column if not exists supporting_document_name text,
  add column if not exists supporting_document_data text;

-- Anonymous homepage requests can only read fields used in partner cards.
revoke select on public.trust_partners from public, anon;
grant select (name, logo_url, website_url, category, city, sort_order, is_published)
  on public.trust_partners to anon;
drop policy if exists "public reads published partners" on public.trust_partners;
create policy "public reads published partners" on public.trust_partners
  for select to anon using (is_published);
drop policy if exists "admins manage partners" on public.trust_partners;
create policy "admins manage partners" on public.trust_partners for all to authenticated
  using (public.is_trust_finance_admin() or public.is_trust_founder())
  with check (public.is_trust_finance_admin() or public.is_trust_founder());

-- Preserve report access and donation submissions for existing portal members.
create or replace function public.can_submit_trust_expense()
returns boolean language sql stable security definer set search_path = public
as $$
  select public.is_trust_finance_admin() or exists (
    select 1 from public.trust_portal_profiles
    where user_id = auth.uid() and role in ('founder', 'secretary', 'treasurer')
  );
$$;
revoke all on function public.can_submit_trust_expense() from public;
grant execute on function public.can_submit_trust_expense() to authenticated;

drop policy if exists "authorized roles submit expenses" on public.trust_financial_entries;
create policy "authorized roles submit expenses" on public.trust_financial_entries
  as restrictive for insert to authenticated
  with check (entry_type <> 'expense' or public.can_submit_trust_expense());

drop policy if exists "portal members upload finance receipts" on storage.objects;
create policy "portal members upload finance receipts" on storage.objects for insert to authenticated
  with check (bucket_id = 'trust-finance-private' and public.can_submit_trust_expense());

drop policy if exists "portal members read expense receipts" on storage.objects;
create policy "portal members read expense receipts" on storage.objects for select to authenticated
  using (
    bucket_id = 'trust-finance-private' and public.is_trust_portal_user()
    and exists (
      select 1 from public.trust_financial_entries entry
      where entry.entry_type = 'expense' and entry.attachment_path = objects.name
    )
  );

drop policy if exists "Allow owner panel delete for static site" on public.volunteer_registrations;
drop policy if exists "only admins delete volunteers" on public.volunteer_registrations;
create policy "only admins delete volunteers" on public.volunteer_registrations
  as restrictive for delete to authenticated using (public.is_trust_finance_admin());

commit;

-- Address fields for public registration forms.
alter table public.volunteer_registrations
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists pin_code text;

alter table public.donation_records
  add column if not exists state text,
  add column if not exists country text,
  add column if not exists pin_code text;

begin;

create or replace function public.can_manage_financial_documents()
returns boolean language sql stable set search_path = public
as $$ select public.is_trust_finance_admin() or public.is_trust_founder(); $$;
revoke all on function public.can_manage_financial_documents() from public;
grant execute on function public.can_manage_financial_documents() to authenticated;

create table if not exists public.financial_documents (
  id uuid primary key default gen_random_uuid(),
  fiscal_year integer not null check (fiscal_year between 2000 and 2199),
  category text not null check (category in ('01 - Financial Statements','02 - Income Tax Returns','03 - Audit Reports','04 - Bank Statements','05 - Donation & Expense Records','06 - Annual Reports','07 - Meetings & Resolutions','08 - Other Documents','Permanent Documents')),
  title text not null check (length(trim(title)) between 1 and 160),
  document_date date,
  prepared_by text,
  reference_number text,
  remarks text,
  access_level text not null check (access_level in ('admin','all','selected')),
  trustee_ids uuid[] not null default '{}',
  status text not null check (status in ('Draft','Finalized','Audited','Filed')),
  published boolean not null default false check (not published or status <> 'Draft'),
  archived boolean not null default false,
  file_name text not null,
  storage_path text not null unique,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  check (access_level <> 'selected' or cardinality(trustee_ids) > 0)
);
create index if not exists financial_documents_year_idx on public.financial_documents(fiscal_year);
create table if not exists public.financial_activity_logs (
  id bigint generated always as identity primary key,
  document_id uuid not null,
  actor uuid,
  action text not null,
  occurred_at timestamptz not null default now(),
  snapshot jsonb
);
create index if not exists financial_activity_document_idx on public.financial_activity_logs(document_id);
create table if not exists public.financial_year_checklist (
  fiscal_year integer primary key check (fiscal_year between 2000 and 2199),
  completed text[] not null default '{}'
);

alter table public.financial_documents enable row level security;
alter table public.financial_activity_logs enable row level security;
alter table public.financial_year_checklist enable row level security;

revoke all on public.financial_documents, public.financial_activity_logs, public.financial_year_checklist from anon, authenticated;
grant select, insert, update on public.financial_documents, public.financial_year_checklist to authenticated;
grant select on public.financial_activity_logs to authenticated;

drop policy if exists financial_documents_read on public.financial_documents;
create policy financial_documents_read on public.financial_documents for select to authenticated using (
  public.can_manage_financial_documents() or (
    public.is_trustee() and published and not archived and
    (access_level = 'all' or (access_level = 'selected' and auth.uid() = any(trustee_ids)))
  )
);
drop policy if exists financial_documents_insert on public.financial_documents;
create policy financial_documents_insert on public.financial_documents for insert to authenticated
with check (public.can_manage_financial_documents());
drop policy if exists financial_documents_update on public.financial_documents;
create policy financial_documents_update on public.financial_documents for update to authenticated
using (public.can_manage_financial_documents()) with check (public.can_manage_financial_documents());
drop policy if exists financial_activity_read on public.financial_activity_logs;
create policy financial_activity_read on public.financial_activity_logs for select to authenticated
using (public.can_manage_financial_documents());
drop policy if exists financial_checklist_read on public.financial_year_checklist;
create policy financial_checklist_read on public.financial_year_checklist for select to authenticated
using (public.is_trust_portal_user());
drop policy if exists financial_checklist_write on public.financial_year_checklist;
create policy financial_checklist_write on public.financial_year_checklist for all to authenticated
using (public.can_manage_financial_documents()) with check (public.can_manage_financial_documents());

create or replace function public.track_financial_document()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.version := old.version + case when old.storage_path <> new.storage_path then 1 else 0 end;
    new.updated_at := now();
    insert into public.financial_activity_logs(document_id, actor, action, snapshot)
    values (new.id, auth.uid(), case when new.archived and not old.archived then 'Archived'
      when old.storage_path <> new.storage_path then 'File replaced'
      when new.published and not old.published then 'Published' else 'Edited' end, to_jsonb(old));
  else
    new.version := 1;
    insert into public.financial_activity_logs(document_id, actor, action)
    values (new.id, auth.uid(), 'Uploaded');
  end if;
  return new;
end;
$$;
revoke all on function public.track_financial_document() from public;
drop trigger if exists track_financial_document on public.financial_documents;
create trigger track_financial_document before insert or update on public.financial_documents
for each row execute function public.track_financial_document();

create or replace function public.financial_document_opened(p_document_id uuid, p_action text)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if p_action not in ('Viewed','Downloaded') or not exists (
    select 1 from public.financial_documents d where d.id = p_document_id and not d.archived and
    (public.can_manage_financial_documents() or (public.is_trustee() and d.published and
      (d.access_level = 'all' or (d.access_level = 'selected' and auth.uid() = any(d.trustee_ids)))))
  ) then raise exception 'Document unavailable'; end if;
  insert into public.financial_activity_logs(document_id,actor,action) values(p_document_id,auth.uid(),p_action);
end;
$$;
revoke all on function public.financial_document_opened(uuid,text) from public;
grant execute on function public.financial_document_opened(uuid,text) to authenticated;

create or replace function public.financial_document_trustees()
returns table(user_id uuid, full_name text, role text)
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.can_manage_financial_documents() then raise exception 'Access denied'; end if;
  return query select p.user_id, p.full_name, p.role from public.trust_portal_profiles p
    where p.role in ('secretary','treasurer','trustee') order by p.full_name;
end;
$$;
revoke all on function public.financial_document_trustees() from public;
grant execute on function public.financial_document_trustees() to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trust-financial-documents','trust-financial-documents',false,26214400,
  array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists financial_document_files_read on storage.objects;
create policy financial_document_files_read on storage.objects for select to authenticated using (
  bucket_id = 'trust-financial-documents' and (
    public.can_manage_financial_documents() or exists (
      select 1 from public.financial_documents d where d.storage_path = storage.objects.name and not d.archived
    )
  )
);
drop policy if exists financial_document_files_insert on storage.objects;
create policy financial_document_files_insert on storage.objects for insert to authenticated
with check (bucket_id = 'trust-financial-documents' and public.can_manage_financial_documents());

commit;
