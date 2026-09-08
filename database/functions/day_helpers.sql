-- Shared day-tracking database helpers. These functions are security-definer
-- and never trust a client-supplied actor id for mutations.

create or replace function private.day_is_editable(
  p_user_id uuid,
  p_local_date date,
  p_as_of timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_member boolean;
  v_is_invalidated boolean := false;
  v_as_of timestamptz := coalesce(p_as_of, now());
begin
  select exists (
    select 1
    from public.profiles as profile
    join public.memberships as membership
      on membership.user_id = profile.id
    join public.cohorts as cohort
      on cohort.id = membership.cohort_id
     and cohort.is_active = true
    where profile.id = p_user_id
      and membership.removed_at is null
      and p_local_date >= cohort.start_date
      and p_local_date >= membership.join_local_date
      and p_local_date in (
        timezone(profile.timezone, v_as_of)::date,
        timezone(profile.timezone, v_as_of)::date - 1
      )
  )
  into v_is_member;

  if not v_is_member then
    return false;
  end if;

  -- Moderation owns day_overrides in a later migration. Day tracking remains
  -- usable before that table exists and starts honoring it as soon as it is
  -- present.
  if to_regclass('public.day_overrides') is not null then
    execute $query$
      select exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = $1
          and day_override.local_date = $2
          and day_override.kind = 'invalidated'
          and day_override.created_at <= $3
      )
    $query$
    into v_is_invalidated
    using p_user_id, p_local_date, v_as_of;
  end if;

  return not v_is_invalidated;
end;
$$;

-- Latest manual "done" flag for one member/date/goal, folding in a signed
-- boolean-shaped day_deltas row. Goal-id based, so it already covers every
-- checkbox-shaped goal (including what used to be the dedicated diet toggle)
-- with a single implementation.
create or replace function private.day_latest_manual_done(
  p_user_id uuid,
  p_local_date date,
  p_goal_id uuid,
  p_as_of timestamptz default now()
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select delta.manual_done
      from public.day_deltas as delta
      where delta.user_id = p_user_id
        and delta.local_date = p_local_date
        and delta.goal_id = p_goal_id
        and delta.manual_done is not null
        and delta.created_at <= coalesce(p_as_of, now())
      order by delta.created_at desc, delta.id desc
      limit 1
    ),
    false
  );
$$;

create or replace function private.day_assert_active_actor(
  p_user_id uuid,
  p_local_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if auth.uid() <> p_user_id then
    raise exception 'ACTOR_MISMATCH';
  end if;

  if not private.is_active_member(p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not private.day_is_editable(p_user_id, p_local_date, now()) then
    raise exception 'DATE_NOT_EDITABLE';
  end if;
end;
$$;

create or replace function private.day_seed_default_containers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cohort_id = private.active_cohort_id()
     and new.removed_at is null
     and not exists (
       select 1
       from public.water_containers as container
       where container.owner_id = new.user_id
     ) then
    insert into public.water_containers (owner_id, label, volume_ml, sort_order)
    values
      (new.user_id, 'Glass', 250, 0),
      (new.user_id, 'Bottle', 500, 1);
  end if;

  return new;
end;
$$;

-- Every current-model day_deltas row (goal_id is not null) must match the
-- shape of the goal it references -- a signed amount for a numeric goal, a
-- manual_done flag for a checkbox goal -- and the goal must belong to this
-- member and still be active. This is the goal-id equivalent of
-- private.validate_optional_goal_log, which enforced the same three things
-- for the now-retired optional_goal_logs table.
create or replace function private.validate_day_delta_goal()
returns trigger
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_goal_target numeric;
  v_goal_active boolean;
begin
  if new.goal_id is null then
    -- Legacy goal_key rows are never inserted by any current code path.
    return new;
  end if;

  select goal.target_value, goal.active
    into v_goal_target, v_goal_active
  from public.goals as goal
  where goal.id = new.goal_id
    and goal.owner_id = new.user_id;

  if not found then
    raise exception 'GOAL_NOT_FOUND';
  end if;

  if not v_goal_active then
    raise exception 'GOAL_ARCHIVED';
  end if;

  if v_goal_target is null then
    if new.amount_int is not null or new.manual_done is null then
      raise exception 'INVALID_GOAL_SHAPE';
    end if;
  else
    if new.manual_done is not null or new.amount_int is null then
      raise exception 'INVALID_GOAL_SHAPE';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.day_is_editable(uuid, date, timestamptz)
  from public;
revoke all on function private.day_latest_manual_done(uuid, date, uuid, timestamptz)
  from public;
revoke all on function private.day_assert_active_actor(uuid, date)
  from public;
revoke all on function private.day_seed_default_containers()
  from public;
revoke all on function private.validate_day_delta_goal()
  from public;
