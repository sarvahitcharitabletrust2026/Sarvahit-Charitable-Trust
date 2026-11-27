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

-- Count public donors across online submissions and published manual ledger donations.
-- Only the aggregate count is returned; donor details remain private.
create or replace function public.trust_public_donor_count(p_start date, p_end date)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(distinct donor_key)::bigint
  from (
    select coalesce(
      'email:' || lower(nullif(btrim(email), '')),
      'phone:' || nullif(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), ''),
      'name:' || lower(nullif(btrim(donor_name), ''))
    ) as donor_key
    from public.donation_records
    where payment_status = 'submitted'
      and created_at >= (p_start::timestamp at time zone 'Asia/Kolkata')
      and created_at < (p_end::timestamp at time zone 'Asia/Kolkata')

    union all

    select coalesce(
      'email:' || lower(nullif(btrim(donor_email), '')),
      'phone:' || nullif(regexp_replace(coalesce(donor_phone, ''), '\D', '', 'g'), ''),
      'name:' || lower(nullif(btrim(donor_name), ''))
    ) as donor_key
    from public.trust_financial_entries
    where entry_type = 'donation'
      and workflow_status = 'published'
      and entry_date >= p_start
      and entry_date < p_end
  ) as public_donors
  where donor_key is not null;
$$;
revoke all on function public.trust_public_donor_count(date, date) from public;
grant execute on function public.trust_public_donor_count(date, date) to anon, authenticated;