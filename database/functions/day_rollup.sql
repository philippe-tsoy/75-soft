-- private.day_rollup_unchecked's return shape changed from a fixed set of
-- workout/water/reading/diet columns to a dynamic per-member goal list
-- (met_count/total_count + a goals jsonb array). Postgres cannot
-- create-or-replace a function across a return-type change, so every
-- affected signature is dropped first. This runs safely against a fresh
-- database too, since "drop function if exists" is a no-op there.
drop function if exists private.day_rollup_unchecked(uuid, date, timestamptz);
drop function if exists public.get_day_rollup(uuid, date, timestamptz);
drop function if exists public.get_member_day_rollup(uuid, uuid, date, timestamptz);

create or replace function private.day_rollup_unchecked(
  p_user_id uuid,
  p_local_date date,
  p_as_of_instant timestamptz default now()
)
returns table (
  local_date date,
  day_number integer,
  status text,
  editable boolean,
  invalidated boolean,
  met_count integer,
  total_count integer,
  goals jsonb
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_as_of timestamptz := coalesce(p_as_of_instant, now());
  v_today date;
  v_join_date date;
  v_cohort_start date;
  v_timezone text;
  v_invalidated boolean := false;
  v_eligible boolean;
  v_met_count integer := 0;
  v_total_count integer := 0;
  v_goals jsonb := '[]'::jsonb;
  v_status text;
begin
  if p_user_id is null then
    raise exception 'NOT_FOUND';
  end if;

  select
    profile.timezone,
    membership.join_local_date,
    cohort.start_date
  into
    v_timezone,
    v_join_date,
    v_cohort_start
  from public.profiles as profile
  join public.memberships as membership
    on membership.user_id = profile.id
   and membership.removed_at is null
  join public.cohorts as cohort
    on cohort.id = membership.cohort_id
   and cohort.is_active = true
  where profile.id = p_user_id
  limit 1;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  v_today = timezone(v_timezone, v_as_of)::date;

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
    into v_invalidated
    using p_user_id, p_local_date, v_as_of;
  end if;

  v_eligible :=
    p_local_date >= v_cohort_start
    and p_local_date >= v_join_date;

  if v_eligible and not v_invalidated then
    /*
     * "Active on p_local_date" reconstructs each goal's own historical
     * membership window from created_at/archived_at (compared in the
     * member's own timezone, like every other date boundary in this
     * function), so adding or archiving a goal later never retroactively
     * changes an earlier day's denominator -- the same "state as of a point
     * in time" principle day_latest_manual_done already relies on.
     */
    select
      count(*)::integer,
      count(*) filter (where goal_state.met)::integer,
      coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', goal_state.id,
            'name',
              case when goal_state.is_private then 'Secret goal'
              else goal_state.name end,
            'isPrivate', goal_state.is_private,
            'amount', goal_state.amount,
            'target', goal_state.target_value,
            'unit', goal_state.unit,
            'markedDone', goal_state.marked_done,
            'met', goal_state.met
          )
          order by goal_state.sort_order, goal_state.created_at
        ),
        '[]'::jsonb
      )
    into v_total_count, v_met_count, v_goals
    from (
      select
        goal.id,
        goal.name,
        goal.is_private,
        goal.target_value,
        goal.unit,
        goal.sort_order,
        goal.created_at,
        case when goal.target_value is null then null
          else coalesce(sum(delta.amount_int), 0)
        end as amount,
        private.day_latest_manual_done(
          p_user_id, p_local_date, goal.id, v_as_of
        ) as marked_done,
        case
          when goal.target_value is null then
            private.day_latest_manual_done(
              p_user_id, p_local_date, goal.id, v_as_of
            )
          else
            coalesce(sum(delta.amount_int), 0) >= goal.target_value
            or private.day_latest_manual_done(
              p_user_id, p_local_date, goal.id, v_as_of
            )
        end as met
      from public.goals as goal
      left join public.day_deltas as delta
        on delta.goal_id = goal.id
       and delta.local_date = p_local_date
       and delta.created_at <= v_as_of
       and delta.amount_int is not null
      where goal.owner_id = p_user_id
        and timezone(v_timezone, goal.created_at)::date <= p_local_date
        and (
          goal.archived_at is null
          or timezone(v_timezone, goal.archived_at)::date > p_local_date
        )
      group by
        goal.id, goal.name, goal.is_private, goal.target_value,
        goal.unit, goal.sort_order, goal.created_at
    ) as goal_state;
  end if;

  if not v_eligible then
    v_status := 'unscored';
  elsif p_local_date > v_today then
    v_status := 'future';
  elsif v_total_count = 0 then
    v_status := 'unscored';
  elsif v_met_count = v_total_count then
    v_status := 'complete';
  elsif p_local_date = v_today then
    v_status := case when v_met_count = 0 then 'open' else 'in_progress' end;
  else
    v_status := case when v_met_count = 0 then 'missed' else 'partial' end;
  end if;

  return query
  select
    p_local_date,
    (p_local_date - v_cohort_start + 1)::integer,
    v_status,
    private.day_is_editable(p_user_id, p_local_date, v_as_of),
    v_invalidated,
    case when v_invalidated or not v_eligible then 0 else v_met_count end,
    case when v_invalidated or not v_eligible then 0 else v_total_count end,
    case
      when v_invalidated or not v_eligible then '[]'::jsonb
      else v_goals
    end;
end;
$$;

create or replace function public.get_day_rollup(
  p_user_id uuid,
  p_local_date date,
  p_as_of_instant timestamptz default now()
)
returns table (
  local_date date,
  day_number integer,
  status text,
  editable boolean,
  invalidated boolean,
  met_count integer,
  total_count integer,
  goals jsonb
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_user_id is null then
    raise exception 'NOT_FOUND';
  end if;

  if auth.uid() <> p_user_id
     and not private.is_admin(auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select *
  from private.day_rollup_unchecked(
    p_user_id,
    p_local_date,
    p_as_of_instant
  );
end;
$$;

create or replace function public.get_calendar(
  p_user_id uuid,
  p_from_date date,
  p_to_date date,
  p_as_of_instant timestamptz default now()
)
returns table (
  local_date date,
  day_number integer,
  status text,
  met_count integer,
  editable boolean,
  invalidated boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_from_date is null
     or p_to_date is null
     or p_from_date > p_to_date then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  return query
  select
    rollup.local_date,
    rollup.day_number,
    rollup.status,
    rollup.met_count,
    rollup.editable,
    rollup.invalidated
  from generate_series(
    p_from_date::timestamp,
    p_to_date::timestamp,
    interval '1 day'
  ) as dates(local_timestamp)
  cross join lateral public.get_day_rollup(
    p_user_id,
    dates.local_timestamp::date,
  coalesce(p_as_of_instant, now())
  ) as rollup;
end;
$$;

create or replace function private.day_member_read_allowed(
  p_viewer_id uuid,
  p_subject_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    auth.uid() is not null
    and p_viewer_id is not null
    and p_subject_id is not null
    and auth.uid() = p_viewer_id
    and private.is_active_member(p_viewer_id)
    and private.is_active_member(p_subject_id)
$$;

create or replace function public.get_member_day_rollup(
  p_viewer_id uuid,
  p_user_id uuid,
  p_local_date date,
  p_as_of_instant timestamptz default now()
)
returns table (
  local_date date,
  day_number integer,
  status text,
  editable boolean,
  invalidated boolean,
  met_count integer,
  total_count integer,
  goals jsonb
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.day_member_read_allowed(p_viewer_id, p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select *
  from private.day_rollup_unchecked(
    p_user_id,
    p_local_date,
    p_as_of_instant
  );
end;
$$;

create or replace function public.get_member_calendar(
  p_viewer_id uuid,
  p_user_id uuid,
  p_from_date date,
  p_to_date date,
  p_as_of_instant timestamptz default now()
)
returns table (
  local_date date,
  day_number integer,
  status text,
  met_count integer,
  editable boolean,
  invalidated boolean
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.day_member_read_allowed(p_viewer_id, p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if p_from_date is null
     or p_to_date is null
     or p_from_date > p_to_date then
    raise exception 'INVALID_DATE_RANGE';
  end if;

  return query
  select
    rollup.local_date,
    rollup.day_number,
    rollup.status,
    rollup.met_count,
    rollup.editable,
    rollup.invalidated
  from generate_series(
    p_from_date::timestamp,
    p_to_date::timestamp,
    interval '1 day'
  ) as dates(local_timestamp)
  cross join lateral private.day_rollup_unchecked(
    p_user_id,
    dates.local_timestamp::date,
    coalesce(p_as_of_instant, now())
  ) as rollup;
end;
$$;

/*
 * Compatibility overloads keep the documented unprefixed RPC argument names
 * callable while the richer boundary uses the p_* names above. They delegate
 * to the same canonical implementation and never calculate locally.
 */
create or replace function public.get_day_rollup(
  user_id uuid,
  local_date date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select to_jsonb(rollup)
      from public.get_day_rollup($1, $2, now()) as rollup
    ),
    '{}'::jsonb
  );
$$;

create or replace function public.get_calendar(
  user_id uuid,
  from_date date,
  to_date date
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(to_jsonb(cells) order by cells.local_date),
    '[]'::jsonb
  )
  from public.get_calendar($1, $2, $3, now()) as cells;
$$;

revoke all on function public.get_day_rollup(uuid, date, timestamptz)
  from public;
revoke all on function public.get_calendar(uuid, date, date, timestamptz)
  from public;
revoke all on function public.get_day_rollup(uuid, date)
  from public;
revoke all on function public.get_calendar(uuid, date, date)
  from public;
revoke all on function private.day_rollup_unchecked(uuid, date, timestamptz)
  from public;
revoke all on function private.day_member_read_allowed(uuid, uuid)
  from public;
revoke all on function public.get_member_day_rollup(
  uuid,
  uuid,
  date,
  timestamptz
)
  from public;
revoke all on function public.get_member_calendar(
  uuid,
  uuid,
  date,
  date,
  timestamptz
)
  from public;
grant execute on function public.get_day_rollup(uuid, date, timestamptz)
  to authenticated;
grant execute on function public.get_calendar(uuid, date, date, timestamptz)
  to authenticated;
grant execute on function public.get_day_rollup(uuid, date)
  to authenticated;
grant execute on function public.get_calendar(uuid, date, date)
  to authenticated;
grant execute on function public.get_member_day_rollup(
  uuid,
  uuid,
  date,
  timestamptz
)
  to authenticated;
grant execute on function public.get_member_calendar(
  uuid,
  uuid,
  date,
  date,
  timestamptz
)
  to authenticated;
