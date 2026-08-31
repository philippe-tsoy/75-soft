-- 75 Soft optional personal goals.
-- Optional goals and their quiet logs are private to their owner. They are
-- deliberately independent from the required-goal scoring tables.

begin;

create table if not exists public.optional_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  target_value numeric null,
  unit text null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint optional_goals_owner_id_id_unique unique (id, owner_id),
  constraint optional_goals_name_check check (
    char_length(btrim(name)) between 1 and 80
  ),
  constraint optional_goals_unit_check check (
    unit is null or char_length(btrim(unit)) between 1 and 40
  ),
  constraint optional_goals_target_check check (
    target_value is null
    or (
      target_value <> 'NaN'::numeric
      and target_value > 0
      and target_value <= 1000000
    )
  ),
  constraint optional_goals_shape_check check (
    (target_value is null and unit is null)
    or (target_value is not null and unit is not null)
  )
);

create index if not exists optional_goals_owner_active_idx
  on public.optional_goals (owner_id, active, created_at);

drop trigger if exists optional_goals_set_updated_at
  on public.optional_goals;
create trigger optional_goals_set_updated_at
before update on public.optional_goals
for each row execute function public.set_updated_at();

-- Archiving is one-way in v1. Historical rows remain readable, but an
-- archived goal cannot be silently reactivated by a direct table client.
create or replace function private.prevent_optional_goal_reactivation()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if old.active = false and new.active = true then
    raise exception 'Archived optional goals cannot be reactivated'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_optional_goal_reactivation() from public;

drop trigger if exists optional_goals_prevent_reactivation
  on public.optional_goals;
create trigger optional_goals_prevent_reactivation
before update on public.optional_goals
for each row execute function private.prevent_optional_goal_reactivation();

create table if not exists public.optional_goal_logs (
  id uuid primary key default gen_random_uuid(),
  optional_goal_id uuid not null,
  owner_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  value numeric null,
  completed boolean null,
  client_operation_id text not null,
  created_at timestamptz not null default now(),
  constraint optional_goal_logs_goal_owner_fk
    foreign key (optional_goal_id, owner_id)
    references public.optional_goals (id, owner_id)
    on delete restrict,
  constraint optional_goal_logs_operation_id_check check (
    client_operation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint optional_goal_logs_value_check check (
    value is null
    or (
      value <> 'NaN'::numeric
      and value > 0
      and value <= 1000000
    )
  ),
  constraint optional_goal_logs_shape_check check (
    (value is not null and completed is null)
    or (value is null and completed is not null)
  ),
  constraint optional_goal_logs_owner_operation_unique
    unique (owner_id, client_operation_id)
);

create index if not exists optional_goal_logs_owner_date_idx
  on public.optional_goal_logs (owner_id, local_date, created_at);

create index if not exists optional_goal_logs_goal_date_idx
  on public.optional_goal_logs (optional_goal_id, local_date, created_at);

-- A row can only be logged with the shape configured by its goal, and
-- archiving immediately stops new logs while preserving existing history.
create or replace function private.validate_optional_goal_log()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  goal_target numeric;
  goal_active boolean;
  owner_timezone text;
  join_local_date date;
  member_local_date date;
begin
  select target_value, active
    into goal_target, goal_active
  from public.optional_goals
  where id = new.optional_goal_id
    and owner_id = new.owner_id;

  if not found then
    raise exception 'Optional goal was not found'
      using errcode = '23503';
  end if;

  if not goal_active then
    raise exception 'Archived optional goals cannot receive new logs'
      using errcode = '23514';
  end if;

  select profile.timezone, membership.join_local_date
    into owner_timezone, join_local_date
  from public.profiles as profile
  join public.memberships as membership
    on membership.user_id = profile.id
   and membership.cohort_id = private.active_cohort_id()
   and membership.removed_at is null
  where profile.id = new.owner_id;

  if not found then
    raise exception 'Optional goal owner is not an active member'
      using errcode = '42501';
  end if;

  member_local_date := (now() at time zone owner_timezone)::date;
  if new.local_date < join_local_date
     or new.local_date not in (member_local_date, member_local_date - 1) then
    raise exception 'Optional goal logs are limited to today or yesterday'
      using errcode = '23514';
  end if;

  if goal_target is null and new.completed is null then
    raise exception 'Checkbox optional goals require completed'
      using errcode = '23514';
  end if;

  if goal_target is not null and new.value is null then
    raise exception 'Numeric optional goals require value'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_optional_goal_log() from public;

drop trigger if exists optional_goal_logs_validate_shape
  on public.optional_goal_logs;
create trigger optional_goal_logs_validate_shape
before insert on public.optional_goal_logs
for each row execute function private.validate_optional_goal_log();

alter table public.optional_goals enable row level security;
alter table public.optional_goal_logs enable row level security;

drop policy if exists optional_goals_owner_select on public.optional_goals;
create policy optional_goals_owner_select
on public.optional_goals
for select
to authenticated
using (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
);

drop policy if exists optional_goals_owner_insert on public.optional_goals;
create policy optional_goals_owner_insert
on public.optional_goals
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
);

drop policy if exists optional_goals_owner_update on public.optional_goals;
create policy optional_goals_owner_update
on public.optional_goals
for update
to authenticated
using (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
)
with check (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
);

drop policy if exists optional_goal_logs_owner_select
  on public.optional_goal_logs;
create policy optional_goal_logs_owner_select
on public.optional_goal_logs
for select
to authenticated
using (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
);

drop policy if exists optional_goal_logs_owner_insert
  on public.optional_goal_logs;
create policy optional_goal_logs_owner_insert
on public.optional_goal_logs
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
);

revoke all on public.optional_goals from anon, authenticated;
revoke all on public.optional_goal_logs from anon, authenticated;
grant select, insert, update on public.optional_goals to authenticated;
grant select, insert on public.optional_goal_logs to authenticated;
revoke update, delete on public.optional_goal_logs from authenticated;

commit;
