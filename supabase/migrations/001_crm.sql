create extension if not exists pgcrypto;
create table public.workspaces (id uuid primary key default gen_random_uuid(), name text not null);
create table public.workspace_members (workspace_id uuid references public.workspaces on delete cascade, user_id uuid references auth.users on delete cascade, role text not null check (role in ('admin','member')), primary key(workspace_id,user_id));
create function public.is_member(w uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from public.workspace_members where workspace_id=w and user_id=auth.uid()); $$;
revoke all on function public.is_member(uuid) from public;
grant execute on function public.is_member(uuid) to authenticated;
create table public.contacts (
 id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade,
 name text not null check(length(trim(name))>0), company text not null default '', title text not null default '', email text not null default '', phone text not null default '', linkedin text not null default '', country text not null default '', timezone text not null default '', industry text not null default '', type text not null default 'Direct customer' check(type in ('Direct customer','Consultant','Partner')), source text not null default '', status text not null default 'New' check(status in ('New','Contacted','Replied','Interested','Meeting booked','Nurture','Not interested','Do not contact','Converted')), priority text not null default 'Medium' check(priority in ('High','Medium','Low')), next_date date, next_action text not null default '', pain text not null default '', notes text not null default '', owner text not null default '', created_at timestamptz not null default now(), unique(workspace_id,id)
);
create unique index contacts_email_unique on public.contacts(workspace_id,lower(trim(email))) where trim(email)<>'';
create index contacts_due on public.contacts(workspace_id,next_date);
create table public.activities (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, contact_id uuid not null, kind text not null, channel text not null, notes text not null default '', created_at timestamptz not null default now(), foreign key(workspace_id,contact_id) references public.contacts(workspace_id,id) on delete cascade);
create index activities_contact on public.activities(workspace_id,contact_id,created_at desc);
create table public.companies (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, name text not null, website text not null default '', country text not null default '', industry text not null default '', notes text not null default '');
create unique index companies_name_unique on public.companies(workspace_id,lower(trim(name)));
create table public.opportunities (id uuid primary key default gen_random_uuid(), workspace_id uuid not null references public.workspaces on delete cascade, contact_id uuid, name text not null, type text not null check(type in ('Direct customer','Consultant','Partner')), stage text not null check(stage in ('Qualified','Discovery','Demo / Scoping','Proposal sent','Pilot / Negotiation','Closed won','Closed lost')), value numeric not null default 0 check(value>=0), currency text not null default 'USD', close_date date, notes text not null default '', created_at timestamptz not null default now(), foreign key(workspace_id,contact_id) references public.contacts(workspace_id,id) on delete set null (contact_id));
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
create policy workspace_read on public.workspaces for select to authenticated using(public.is_member(id));
create policy member_read on public.workspace_members for select to authenticated using(public.is_member(workspace_id));
grant select on public.workspaces,public.workspace_members to authenticated;
do $$ declare t text; begin foreach t in array array['contacts','activities','companies','opportunities'] loop execute format('alter table public.%I enable row level security',t); execute format('create policy member_access on public.%I for all to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))',t); execute format('grant select, insert, update, delete on public.%I to authenticated',t); end loop; end $$;
-- Atomically record activity and schedule the next action; RLS still applies.
create function public.log_activity(w uuid,c uuid,k text,ch text,n text,s text,d date,a text) returns void language plpgsql security invoker set search_path='' as $$ begin
 if not public.is_member(w) then raise exception 'Not authorized'; end if;
 update public.contacts set status=s,next_date=d,next_action=a where workspace_id=w and id=c;
 if not found then raise exception 'Contact not found'; end if;
 insert into public.activities(workspace_id,contact_id,kind,channel,notes) values(w,c,k,ch,n);
end; $$;
revoke all on function public.log_activity(uuid,uuid,text,text,text,text,date,text) from public;
grant execute on function public.log_activity(uuid,uuid,text,text,text,text,date,text) to authenticated;
