alter table public.donation_records
  add column if not exists certificate_delivery text[] not null default '{}';

alter table public.donation_records
  add column if not exists certificate_delivery_status jsonb not null default '{}'::jsonb;

alter table public.donation_records
  add column if not exists eighty_g_certificate_status text not null default 'Pending',
  add column if not exists eighty_g_certificate_url text;
