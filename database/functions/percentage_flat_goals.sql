-- Updates the percentage-completion functions (originally defined inline in
-- 0012_teams.sql and 0013_percentage_completion.sql, both historical and not
-- re-run) for the flat goals model: the denominator was a literal
-- "count(*) * 4" (four required goals per scored day); it becomes
-- "sum(total_count)", the actual number of goals each member had active on
-- each of those days -- day_rollup_unchecked already reconstructs that
-- per-day denominator historically correctly (see day_rollup.sql).

create or replace function private.member_percentage_unchecked(
  p_user_id uuid,
  p_as_of_instant timestamptz default now()
)
returns table (
  numerator integer,
  denominator integer,
  pct integer
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_as_of timestamptz := coalesce(p_as_of_instant, now());
  v_timezone text;
  v_join_date date;
  v_cohort_start date;
  v_today date;
  v_from date;
  v_numerator integer := 0;
  v_denominator integer := 0;
begin
  select profile.timezone, membership.join_local_date, cohort.start_date
  into v_timezone, v_join_date, v_cohort_start
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

  v_today := timezone(v_timezone, v_as_of)::date;
  v_from := greatest(v_join_date, v_cohort_start);

  if v_from <= v_today then
    select
      coalesce(sum(rollup.met_count), 0),
      coalesce(sum(rollup.total_count), 0)
    into v_numerator, v_denominator
    from generate_series(
      v_from::timestamp,
      v_today::timestamp,
      interval '1 day'
    ) as dates(local_timestamp)
    cross join lateral private.day_rollup_unchecked(
      p_user_id,
      dates.local_timestamp::date,
      v_as_of
    ) as rollup;
  end if;

  return query
  select
    v_numerator,
    v_denominator,
    case
      when v_denominator = 0 then 0
      else round(100.0 * v_numerator / v_denominator)::integer
    end;
end;
$$;

create or replace function private.global_percentage_unchecked(
  p_as_of_instant timestamptz default now()
)
returns table (
  numerator integer,
  denominator integer,
  pct integer
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_as_of timestamptz := coalesce(p_as_of_instant, now());
  v_numerator integer := 0;
  v_denominator integer := 0;
  v_member record;
  v_member_pct record;
begin
  for v_member in
    select profile.id
    from public.profiles as profile
    join public.memberships as membership
      on membership.user_id = profile.id
     and membership.removed_at is null
    join public.cohorts as cohort
      on cohort.id = membership.cohort_id
     and cohort.is_active = true
  loop
    select * into v_member_pct
    from private.member_percentage_unchecked(v_member.id, v_as_of);

    v_numerator := v_numerator + coalesce(v_member_pct.numerator, 0);
    v_denominator := v_denominator + coalesce(v_member_pct.denominator, 0);
  end loop;

  return query
  select
    v_numerator,
    v_denominator,
    case
      when v_denominator = 0 then 0
      else round(100.0 * v_numerator / v_denominator)::integer
    end;
end;
$$;

create or replace function private.team_percentage_unchecked(
  p_team_id uuid,
  p_as_of_instant timestamptz default now()
)
returns table (
  numerator integer,
  denominator integer,
  pct integer,
  member_count integer
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_as_of timestamptz := coalesce(p_as_of_instant, now());
  v_numerator integer := 0;
  v_denominator integer := 0;
  v_member_count integer;
  v_period record;
  v_timezone text;
  v_join_date date;
  v_cohort_start date;
  v_today date;
  v_from date;
  v_to date;
  v_period_numerator integer;
  v_period_denominator integer;
begin
  select count(*)
  into v_member_count
  from public.team_memberships
  where team_id = p_team_id
    and left_at is null;

  for v_period in
    select membership.user_id, membership.joined_at, membership.left_at
    from public.team_memberships as membership
    where membership.team_id = p_team_id
      and membership.joined_at <= v_as_of
  loop
    select profile.timezone, gm.join_local_date, cohort.start_date
    into v_timezone, v_join_date, v_cohort_start
    from public.profiles as profile
    join public.memberships as gm
      on gm.user_id = profile.id
     and gm.removed_at is null
    join public.cohorts as cohort
      on cohort.id = gm.cohort_id
     and cohort.is_active = true
    where profile.id = v_period.user_id
    limit 1;

    if not found then
      continue;
    end if;

    v_today := timezone(v_timezone, v_as_of)::date;
    v_from := greatest(
      v_join_date,
      v_cohort_start,
      timezone(v_timezone, v_period.joined_at)::date
    );
    v_to := least(
      v_today,
      case
        when v_period.left_at is null then v_today
        else timezone(v_timezone, least(v_period.left_at, v_as_of))::date
      end
    );

    if v_from > v_to then
      continue;
    end if;

    select
      coalesce(sum(rollup.met_count), 0),
      coalesce(sum(rollup.total_count), 0)
    into v_period_numerator, v_period_denominator
    from generate_series(
      v_from::timestamp,
      v_to::timestamp,
      interval '1 day'
    ) as dates(local_timestamp)
    cross join lateral private.day_rollup_unchecked(
      v_period.user_id,
      dates.local_timestamp::date,
      v_as_of
    ) as rollup;

    v_numerator := v_numerator + v_period_numerator;
    v_denominator := v_denominator + v_period_denominator;
  end loop;

  return query
  select
    v_numerator,
    v_denominator,
    case
      when v_denominator = 0 then 0
      else round(100.0 * v_numerator / v_denominator)::integer
    end,
    v_member_count;
end;
$$;

revoke all on function private.member_percentage_unchecked(uuid, timestamptz)
  from public;
revoke all on function private.global_percentage_unchecked(timestamptz)
  from public;
revoke all on function private.team_percentage_unchecked(uuid, timestamptz)
  from public;
