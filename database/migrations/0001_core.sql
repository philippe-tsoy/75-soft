-- 75 Soft core foundation.
-- Domain migrations add day tracking, social, optional-goal, achievement, and
-- moderation tables. Never put clear invite codes or secrets in this file.

begin;

create extension if not exists pgcrypto;
create extension if not exists citext;

create table if not exists public.cohorts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date not null default date '2026-09-01',
  end_date date null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint cohorts_date_range check (end_date is null or end_date >= start_date)
);

create unique index if not exists cohorts_one_active
  on public.cohorts ((is_active))
  where is_active = true;

insert into public.cohorts (name, start_date, end_date, is_active)
select '75 Soft', date '2026-09-01', null, true
where not exists (
  select 1
  from public.cohorts
  where is_active = true
);

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email citext not null unique,
  display_name text not null,
  avatar_path text null,
  timezone text not null,
  reaction_palette jsonb not null default '["👍", "🔥", "😂", "❤️", "💪"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_not_blank check (length(btrim(display_name)) > 0),
  constraint profiles_reaction_palette_array check (
    jsonb_typeof(reaction_palette) = 'array'
  )
);

create table if not exists public.memberships (
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  join_local_date date not null,
  removed_at timestamptz null,
  removed_by uuid null references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (cohort_id, user_id),
  constraint memberships_role_check check (role in ('member', 'admin')),
  constraint memberships_removed_actor_check check (
    removed_at is null or removed_by is not null
  )
);

create unique index if not exists memberships_one_active_admin
  on public.memberships (cohort_id)
  where role = 'admin' and removed_at is null;

create index if not exists memberships_user_active_idx
  on public.memberships (user_id, removed_at);

create table if not exists public.invite_codes (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  code_digest text not null,
  code_ciphertext text not null,
  code_hint text not null,
  is_active boolean not null default true,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  rotated_at timestamptz null
);

create unique index if not exists invite_codes_one_active_per_cohort
  on public.invite_codes (cohort_id)
  where is_active = true;

create table if not exists public.signup_intents (
  id uuid primary key default gen_random_uuid(),
  invite_digest text not null,
  auth_user_id uuid null references auth.users (id) on delete cascade,
  email_digest text null,
  nonce_digest text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists signup_intents_expiry_idx
  on public.signup_intents (expires_at);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid null references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id uuid null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists audit_log_created_at_idx
  on public.audit_log (created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create schema if not exists private;

create or replace function private.active_cohort_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.cohorts
  where is_active = true
  order by created_at
  limit 1
$$;

create or replace function private.is_active_member(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships as membership
    where membership.user_id = p_user_id
      and membership.cohort_id = private.active_cohort_id()
      and membership.removed_at is null
  )
$$;

create or replace function private.is_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships as membership
    where membership.user_id = p_user_id
      and membership.cohort_id = private.active_cohort_id()
      and membership.role = 'admin'
      and membership.removed_at is null
  )
$$;

revoke all on function private.active_cohort_id() from public;
revoke all on function private.is_active_member(uuid) from public;
revoke all on function private.is_admin(uuid) from public;
grant execute on function private.active_cohort_id() to authenticated;
grant execute on function private.is_active_member(uuid) to authenticated;
grant execute on function private.is_admin(uuid) to authenticated;

alter table public.cohorts enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.invite_codes enable row level security;
alter table public.signup_intents enable row level security;
alter table public.audit_log enable row level security;

drop policy if exists cohorts_member_select on public.cohorts;
create policy cohorts_member_select
on public.cohorts
for select
to authenticated
using (private.is_active_member(auth.uid()) and is_active = true);

drop policy if exists profiles_member_select on public.profiles;
create policy profiles_member_select
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or (
    private.is_active_member(auth.uid())
    and private.is_active_member(id)
  )
);

-- Profile creation and membership completion are server-controlled. There is
-- intentionally no client INSERT policy for profiles.
drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update
on public.profiles
for update
to authenticated
using (id = auth.uid() and private.is_active_member(auth.uid()))
with check (id = auth.uid() and private.is_active_member(auth.uid()));

drop policy if exists memberships_member_select on public.memberships;
create policy memberships_member_select
on public.memberships
for select
to authenticated
using (
  user_id = auth.uid()
  or private.is_admin(auth.uid())
  or (
    private.is_active_member(auth.uid())
    and removed_at is null
  )
);

drop policy if exists invite_codes_admin_select on public.invite_codes;
create policy invite_codes_admin_select
on public.invite_codes
for select
to authenticated
using (private.is_admin(auth.uid()));

drop policy if exists audit_log_admin_select on public.audit_log;
create policy audit_log_admin_select
on public.audit_log
for select
to authenticated
using (private.is_admin(auth.uid()));

-- signup_intents and all core inserts/updates are server-controlled. Service
-- role or future SECURITY DEFINER completion functions perform them.

commit;
