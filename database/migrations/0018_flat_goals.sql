-- Replaces the 4 fixed required goals + the separate optional_goals feature
-- with one flat, user-owned goal list. Every goal (including what used to
-- be workout/water/reading/diet) is now a row in public.goals a member
-- explicitly added; there are no defaults. Existing day_deltas rows are
-- left untouched (goal_key, no goal_id) and simply stop contributing to the
-- board/percentage -- every member, new or existing, starts at zero active
-- goals and picks their own. Function bodies live in database/functions and
-- are included here so this migration remains a single forward-only
-- deployment entry point.

begin;

create table if not exists public.goal_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  target_value numeric null,
  unit text null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint goal_templates_name_check check (
    char_length(btrim(name)) between 1 and 80
  ),
  constraint goal_templates_unit_check check (
    unit is null or char_length(btrim(unit)) between 1 and 40
  ),
  constraint goal_templates_target_check check (
    target_value is null
    or (
      target_value <> 'NaN'::numeric
      and target_value > 0
      and target_value <= 1000000
    )
  ),
  constraint goal_templates_shape_check check (
    (target_value is null and unit is null)
    or (target_value is not null and unit is not null)
  )
);

drop trigger if exists goal_templates_set_updated_at
  on public.goal_templates;
create trigger goal_templates_set_updated_at
before update on public.goal_templates
for each row execute function public.set_updated_at();

-- Starting suggestions; an admin can add/retire more later. Guarded by
-- name instead of ON CONFLICT (there is no unique constraint on name) so
-- this insert is safe to run again.
insert into public.goal_templates (name, target_value, unit, sort_order)
select v.name, v.target_value, v.unit, v.sort_order
from (
  values
    ('Workout'::text, 45::numeric, 'minutes'::text, 0),
    ('Water', 2000, 'ml', 1),
    ('Reading', 10, 'pages', 2),
    ('Diet', null, null, 3)
) as v(name, target_value, unit, sort_order)
where not exists (
  select 1 from public.goal_templates as existing
  where existing.name = v.name
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  target_value numeric null,
  unit text null,
  is_private boolean not null default false,
  template_id uuid null references public.goal_templates (id)
    on delete set null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz null,
  constraint goals_owner_id_id_unique unique (id, owner_id),
  constraint goals_name_check check (
    char_length(btrim(name)) between 1 and 80
  ),
  constraint goals_unit_check check (
    unit is null or char_length(btrim(unit)) between 1 and 40
  ),
  constraint goals_target_check check (
    target_value is null
    or (
      target_value <> 'NaN'::numeric
      and target_value > 0
      and target_value <= 1000000
    )
  ),
  constraint goals_shape_check check (
    (target_value is null and unit is null)
    or (target_value is not null and unit is not null)
  ),
  constraint goals_archived_at_check check (
    (active = true and archived_at is null)
    or (active = false and archived_at is not null)
  )
);

create index if not exists goals_owner_active_idx
  on public.goals (owner_id, active, created_at);

drop trigger if exists goals_set_updated_at on public.goals;
create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

-- Archiving is one-way, same as optional_goals before it: reactivating is
-- rejected outright, and the true->false transition stamps archived_at so
-- day_rollup_unchecked can reconstruct which goals were active on any given
-- past date.
create or replace function private.goals_guard_archive_state()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if old.active = false and new.active = true then
    raise exception 'Archived goals cannot be reactivated'
      using errcode = '23514';
  end if;

  if new.active = false and old.active = true then
    new.archived_at := coalesce(new.archived_at, now());
  end if;

  return new;
end;
$$;

revoke all on function private.goals_guard_archive_state() from public;

drop trigger if exists goals_guard_archive_state on public.goals;
create trigger goals_guard_archive_state
before update on public.goals
for each row execute function private.goals_guard_archive_state();

alter table public.goal_templates enable row level security;
alter table public.goals enable row level security;

drop policy if exists goal_templates_member_select on public.goal_templates;
create policy goal_templates_member_select
on public.goal_templates
for select
to authenticated
using (private.is_active_member(auth.uid()));

drop policy if exists goal_templates_admin_write on public.goal_templates;
create policy goal_templates_admin_write
on public.goal_templates
for all
to authenticated
using (
  private.is_admin(auth.uid())
  and private.is_active_member(auth.uid())
)
with check (
  private.is_admin(auth.uid())
  and private.is_active_member(auth.uid())
);

drop policy if exists goals_owner_select on public.goals;
create policy goals_owner_select
on public.goals
for select
to authenticated
using (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
);

drop policy if exists goals_owner_insert on public.goals;
create policy goals_owner_insert
on public.goals
for insert
to authenticated
with check (
  owner_id = auth.uid()
  and private.is_active_member(auth.uid())
);

drop policy if exists goals_owner_update on public.goals;
create policy goals_owner_update
on public.goals
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

revoke all on public.goal_templates from anon, authenticated;
revoke all on public.goals from anon, authenticated;
grant select, insert, update on public.goal_templates to authenticated;
grant select, insert, update on public.goals to authenticated;

-- day_deltas moves from a fixed goal_key vocabulary to goal_id rows
-- referencing public.goals. Existing rows (goal_key, no goal_id) are left
-- exactly as they are -- the "legacy or current, never both" check below
-- is satisfied unconditionally by every one of them, and they simply stop
-- being read by any current-model code path.
alter table public.day_deltas
  alter column goal_key drop not null,
  add column if not exists goal_id uuid null references public.goals (id);

alter table public.day_deltas
  drop constraint if exists day_deltas_shape_check;

alter table public.day_deltas
  add constraint day_deltas_legacy_or_current_check check (
    (goal_key is not null and goal_id is null)
    or (goal_key is null and goal_id is not null)
  ),
  add constraint day_deltas_current_field_shape_check check (
    goal_id is null
    or (
      (
        amount_int is not null
        and amount_int <> 0
        and diet_value is null
        and manual_done is null
      )
      or (
        amount_int is null
        and diet_value is null
        and manual_done is not null
      )
    )
  );

drop trigger if exists day_deltas_validate_goal on public.day_deltas;
create trigger day_deltas_validate_goal
before insert on public.day_deltas
for each row execute function private.validate_day_delta_goal();

-- post_goal_entries gains a frozen "met" flag for the flat model (a
-- checkbox goal's met-ness was already fully captured by
-- optional_completed; this only adds it for numeric goals, whose target
-- can later change or be archived). Nothing else about the table changes:
-- required_goal_key/diet_value/optional_goal_id/optional_goal_name/
-- optional_value/optional_completed are reused as-is going forward, and
-- historical rows in every one of those columns are left alone, matching
-- how required-goal snapshots were already frozen in place in
-- 0014_post_photo_required.sql rather than migrated.
alter table public.post_goal_entries
  add column if not exists met boolean null;

-- optional_goals / optional_goal_logs are retired: their functionality is
-- now covered by public.goals + day_deltas. Data loss here is intentional
-- (see the "everyone starts at zero" decision) -- there were 0
-- optional_goal_logs rows and 1 optional_goals row in production at the
-- time this migration was written.
drop table if exists public.optional_goal_logs;
drop table if exists public.optional_goals;
drop function if exists private.validate_optional_goal_log();
drop function if exists private.prevent_optional_goal_reactivation();

\ir ../functions/day_helpers.sql
\ir ../functions/day_mutations.sql
\ir ../functions/day_rollup.sql
\ir ../functions/day_board.sql
\ir ../functions/read_models_flat_goals.sql
\ir ../functions/percentage_flat_goals.sql
\ir ../functions/achievement_evaluator.sql

-- WATER_BEFORE_NOON and WATER_EXACT_TARGET no longer make sense once
-- "water" is not a guaranteed goal (see achievement_evaluator.sql's
-- header comment). No user has either unlocked yet, so a plain delete is
-- safe -- user_achievements.achievement_id is ON DELETE RESTRICT, so this
-- would fail loudly instead of silently orphaning a real unlock.
delete from public.achievements
where code in ('WATER_BEFORE_NOON', 'WATER_EXACT_TARGET');

commit;
