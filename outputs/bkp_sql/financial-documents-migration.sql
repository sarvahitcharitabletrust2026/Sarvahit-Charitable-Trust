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
