-- 75 Soft percentage completion: a cumulative, non-resetting measure of how
-- much of the challenge-so-far has been completed, at goal-day granularity.
-- Computed fresh on every read from the same source private.day_rollup_unchecked
-- already uses -- nothing is persisted. See
-- 75-soft-spec/TEAMS_PERCENTAGE_AND_DAILY_PHOTO.md §3.

begin;

-- Individual cumulative percentage: sum of met_count across every scored
-- local date from join through the member's current local date, out of
-- 4 * (number of scored dates). Today is included with its live, in-progress
-- met_count, same as the daily Board score already does.
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
    select coalesce(sum(rollup.met_count), 0), count(*) * 4
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

revoke all on function private.member_percentage_unchecked(uuid, timestamptz)
  from public;

-- Global percentage: the same pooled formula across every active member,
-- independent of team membership.
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

revoke all on function private.global_percentage_unchecked(timestamptz)
  from public;

-- Self/admin read, for Today and Me -- mirrors public.get_daily_board_score's
-- self-or-admin shape.
create or replace function public.get_percentage(
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
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_user_id is null
     or (auth.uid() <> p_user_id and not private.is_admin(auth.uid())) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select * from private.member_percentage_unchecked(p_user_id, p_as_of_instant);
end;
$$;

-- Any-active-member read of someone else's percentage, for Person -- mirrors
-- public.get_member_day_rollup's viewer/subject shape.
create or replace function public.get_member_percentage(
  p_viewer_id uuid,
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
begin
  if not private.day_member_read_allowed(p_viewer_id, p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select * from private.member_percentage_unchecked(p_user_id, p_as_of_instant);
end;
$$;

create or replace function public.get_global_percentage(
  p_viewer_id uuid,
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
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_viewer_id is null or auth.uid() <> p_viewer_id then
    raise exception 'FORBIDDEN';
  end if;

  if not private.is_active_member(p_viewer_id) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select * from private.global_percentage_unchecked(p_as_of_instant);
end;
$$;

revoke all on function public.get_percentage(uuid, timestamptz) from public;
revoke all on function public.get_member_percentage(uuid, uuid, timestamptz)
  from public;
revoke all on function public.get_global_percentage(uuid, timestamptz)
  from public;
grant execute on function public.get_percentage(uuid, timestamptz)
  to authenticated;
grant execute on function public.get_member_percentage(uuid, uuid, timestamptz)
  to authenticated;
grant execute on function public.get_global_percentage(uuid, timestamptz)
  to authenticated;

commit;
