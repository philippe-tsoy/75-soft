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
  workout_amount bigint,
  water_amount bigint,
  reading_amount bigint,
  diet_met boolean,
  met_count integer,
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
  v_workout bigint := 0;
  v_water bigint := 0;
  v_reading bigint := 0;
  v_post_workout bigint := 0;
  v_post_water bigint := 0;
  v_post_reading bigint := 0;
  v_diet boolean := false;
  v_invalidated boolean := false;
  v_eligible boolean;
  v_met_count integer := 0;
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

  select
    coalesce(sum(delta.amount_int) filter (where delta.goal_key = 'workout'), 0),
    coalesce(sum(delta.amount_int) filter (where delta.goal_key = 'water'), 0),
    coalesce(sum(delta.amount_int) filter (where delta.goal_key = 'reading'), 0)
  into
    v_workout,
    v_water,
    v_reading
  from public.day_deltas as delta
  where delta.user_id = p_user_id
    and delta.local_date = p_local_date
    and delta.created_at <= v_as_of;

  /*
   * Posts are an optional later-workstream source. Dynamic SQL lets the W2
   * migration apply before posts exist without creating a second rollup.
   */
  if to_regclass('public.posts') is not null
     and to_regclass('public.post_goal_entries') is not null then
    execute $query$
      select
        coalesce(sum(entry.amount_int)
          filter (where entry.required_goal_key = 'workout'), 0),
        coalesce(sum(entry.amount_int)
          filter (where entry.required_goal_key = 'water'), 0),
        coalesce(sum(entry.amount_int)
          filter (where entry.required_goal_key = 'reading'), 0)
      from public.posts as post
      join public.post_goal_entries as entry
        on entry.post_id = post.id
      where post.author_id = $1
        and post.local_date = $2
        and post.status = 'published'
        and coalesce(post.published_at, post.created_at) <= $3
    $query$
    into
      v_post_workout,
      v_post_water,
      v_post_reading
    using p_user_id, p_local_date, v_as_of;
  end if;

  v_workout := v_workout + v_post_workout;
  v_water := v_water + v_post_water;
  v_reading := v_reading + v_post_reading;
  v_diet := private.day_latest_diet_state(p_user_id, p_local_date, v_as_of);

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
    v_met_count :=
      (case when v_workout >= 45 then 1 else 0 end)
      + (case when v_water >= 2000 then 1 else 0 end)
      + (case when v_reading >= 10 then 1 else 0 end)
      + (case when v_diet then 1 else 0 end);
  end if;

  if not v_eligible then
    v_status := 'unscored';
  elsif p_local_date > v_today then
    v_status := 'future';
  elsif v_met_count = 4 then
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
    v_workout,
    v_water,
    v_reading,
    case when v_invalidated or not v_eligible then false else v_diet end,
    case
      when v_invalidated or not v_eligible then 0
      else v_met_count
    end,
    jsonb_build_object(
      'workout', jsonb_build_object(
        'amount', v_workout,
        'target', 45,
        'unit', 'minutes',
        'met',
        case
          when v_invalidated or not v_eligible then false
          else v_workout >= 45
        end
      ),
      'water', jsonb_build_object(
        'amount', v_water,
        'target', 2000,
        'unit', 'ml',
        'met',
        case
          when v_invalidated or not v_eligible then false
          else v_water >= 2000
        end
      ),
      'reading', jsonb_build_object(
        'amount', v_reading,
        'target', 10,
        'unit', 'pages',
        'met',
        case
          when v_invalidated or not v_eligible then false
          else v_reading >= 10
        end
      ),
      'diet', jsonb_build_object(
        'target', 1,
        'unit', 'attestation',
        'met',
        case
          when v_invalidated or not v_eligible then false
          else v_diet
        end
      )
    );
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
  workout_amount bigint,
  water_amount bigint,
  reading_amount bigint,
  diet_met boolean,
  met_count integer,
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
  workout_amount bigint,
  water_amount bigint,
  reading_amount bigint,
  diet_met boolean,
  met_count integer,
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
 * callable while the richer W2/W4 boundary uses the p_* names above. They
 * delegate to the same canonical implementation and never calculate locally.
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
