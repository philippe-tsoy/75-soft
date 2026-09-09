-- Personal analysis for the Stats page: an overall percentage since join
-- (reusing member_percentage_unchecked, same as the Teams roster already
-- did) plus a per-goal breakdown -- every goal the member has ever had,
-- each aggregated over its own historical active window the same way
-- day_rollup_unchecked already reconstructs one day at a time. This is
-- intentionally self-only (no viewer/subject split like get_person_summary)
-- since nothing here is ever shown to anyone but the member themselves.

create or replace function private.member_goal_stats_unchecked(
  p_user_id uuid,
  p_as_of_instant timestamptz default now()
)
returns table (
  goal_id uuid,
  name text,
  is_private boolean,
  active boolean,
  met_days integer,
  eligible_days integer,
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

  if v_from > v_today then
    return;
  end if;

  return query
  select
    goal.id,
    goal.name,
    goal.is_private,
    goal.active,
    coalesce(sum((entry->>'met')::boolean::integer), 0)::integer as met_days,
    count(entry)::integer as eligible_days,
    case
      when count(entry) = 0 then 0
      else round(100.0 * sum((entry->>'met')::boolean::integer) / count(entry))::integer
    end as pct
  from public.goals as goal
  cross join lateral generate_series(
    v_from::timestamp, v_today::timestamp, interval '1 day'
  ) as dates(local_timestamp)
  cross join lateral private.day_rollup_unchecked(
    p_user_id, dates.local_timestamp::date, v_as_of
  ) as rollup
  cross join lateral jsonb_array_elements(rollup.goals) as entry
  where goal.owner_id = p_user_id
    and (entry->>'id')::uuid = goal.id
  group by goal.id, goal.name, goal.is_private, goal.active
  order by pct desc, goal.name asc;
end;
$$;

revoke all on function private.member_goal_stats_unchecked(uuid, timestamptz)
  from public;

create or replace function public.get_member_stats(
  p_user_id uuid,
  p_as_of_instant timestamptz default now()
)
returns table (
  day_number integer,
  numerator integer,
  denominator integer,
  pct integer,
  goals jsonb
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_as_of timestamptz := coalesce(p_as_of_instant, now());
  v_timezone text;
  v_cohort_start date;
  v_today date;
  v_overall record;
  v_goals jsonb;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_user_id is null or auth.uid() <> p_user_id then
    raise exception 'FORBIDDEN';
  end if;

  if not private.is_active_member(p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  select profile.timezone, cohort.start_date
  into v_timezone, v_cohort_start
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

  select * into v_overall
  from private.member_percentage_unchecked(p_user_id, v_as_of);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'goalId', stats.goal_id,
        'name',
          case when stats.is_private then 'Secret goal' else stats.name end,
        'isPrivate', stats.is_private,
        'active', stats.active,
        'metDays', stats.met_days,
        'eligibleDays', stats.eligible_days,
        'pct', stats.pct
      )
    ),
    '[]'::jsonb
  )
  into v_goals
  from private.member_goal_stats_unchecked(p_user_id, v_as_of) as stats;

  return query
  select
    (v_today - v_cohort_start) + 1,
    v_overall.numerator,
    v_overall.denominator,
    v_overall.pct,
    v_goals;
end;
$$;

revoke all on function public.get_member_stats(uuid, timestamptz) from public;
grant execute on function public.get_member_stats(uuid, timestamptz)
  to authenticated;
