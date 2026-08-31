-- W2 day tracking domain tables and policies.
-- Function bodies live in database/functions and are included here so the
-- migration remains the single forward-only deployment entry point.

begin;

create table if not exists public.water_containers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  label text not null,
  volume_ml integer not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  deleted_at timestamptz null,
  active boolean generated always as (deleted_at is null) stored,
  constraint water_containers_label_not_blank check (length(btrim(label)) > 0),
  constraint water_containers_volume_positive check (volume_ml > 0)
);

create index if not exists water_containers_owner_order_idx
  on public.water_containers (owner_id, sort_order, created_at)
  where deleted_at is null;

drop trigger if exists water_containers_set_updated_at
  on public.water_containers;
create trigger water_containers_set_updated_at
before update on public.water_containers
for each row execute function public.set_updated_at();

create table if not exists public.day_deltas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  goal_key text not null,
  amount_int integer null,
  diet_value boolean null,
  source text not null default 'quiet',
  client_operation_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint day_deltas_owner_operation_unique
    unique (user_id, client_operation_id),
  constraint day_deltas_operation_id_check check (
    client_operation_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  constraint day_deltas_source_check check (source = 'quiet'),
  constraint day_deltas_shape_check check (
    (
      goal_key in ('workout', 'water', 'reading')
      and amount_int is not null
      and amount_int > 0
      and diet_value is null
    )
    or (
      goal_key = 'diet'
      and amount_int is null
      and diet_value is not null
    )
  )
);

create index if not exists day_deltas_user_date_created_idx
  on public.day_deltas (user_id, local_date, created_at, id);

alter table public.water_containers enable row level security;
alter table public.day_deltas enable row level security;

revoke all on table public.water_containers from anon, authenticated;
grant select, insert, update on table public.water_containers to authenticated;

drop policy if exists water_containers_owner_select
  on public.water_containers;
create policy water_containers_owner_select
on public.water_containers
for select
to authenticated
using (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
  and deleted_at is null
);

drop policy if exists water_containers_owner_insert
  on public.water_containers;
create policy water_containers_owner_insert
on public.water_containers
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
);

drop policy if exists water_containers_owner_update
  on public.water_containers;
create policy water_containers_owner_update
on public.water_containers
for update
to authenticated
using (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
  and deleted_at is null
)
with check (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
);

drop policy if exists day_deltas_owner_or_admin_select
  on public.day_deltas;
create policy day_deltas_owner_or_admin_select
on public.day_deltas
for select
to authenticated
using (
  private.is_active_member(auth.uid())
  and (
    user_id = auth.uid()
    or private.is_admin(auth.uid())
  )
);

revoke all on table public.day_deltas from anon, authenticated;
grant select on table public.day_deltas to authenticated;

-- psql's \ir keeps function definitions reviewable and independently reusable
-- while applying them as part of this migration.
\ir ../functions/day_helpers.sql
\ir ../functions/day_rollup.sql
\ir ../functions/day_mutations.sql
\ir ../functions/day_board.sql

drop trigger if exists memberships_seed_day_containers
  on public.memberships;
create trigger memberships_seed_day_containers
after insert on public.memberships
for each row execute function private.day_seed_default_containers();

insert into public.water_containers (owner_id, label, volume_ml, sort_order)
select
  membership.user_id,
  defaults.label,
  defaults.volume_ml,
  defaults.sort_order
from public.memberships as membership
cross join (
  values
    ('Glass'::text, 250, 0),
    ('Bottle'::text, 500, 1)
) as defaults(label, volume_ml, sort_order)
where membership.cohort_id = private.active_cohort_id()
  and membership.removed_at is null
  and not exists (
    select 1
    from public.water_containers as existing
    where existing.owner_id = membership.user_id
  );

commit;
