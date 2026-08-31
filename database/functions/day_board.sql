create or replace function private.daily_board_score_unchecked(
  p_user_id uuid,
  p_as_of_instant timestamptz default now()
)
returns table (
  score_date date,
  goals_achieved_today integer,
  workout_met boolean,
  water_met boolean,
  reading_met boolean,
  diet_met boolean,
  eligible boolean
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_as_of timestamptz := coalesce(p_as_of_instant, now());
  v_timezone text;
  v_score_date date;
begin
  select profile.timezone
  into v_timezone
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

  v_score_date := timezone(v_timezone, v_as_of)::date;

  return query
  select
    rollup.local_date,
    case
      when rollup.status = 'unscored' then 0
      else rollup.met_count
    end,
    case
      when rollup.invalidated or rollup.status = 'unscored' then false
      else rollup.workout_amount >= 45
    end,
    case
      when rollup.invalidated or rollup.status = 'unscored' then false
      else rollup.water_amount >= 2000
    end,
    case
      when rollup.invalidated or rollup.status = 'unscored' then false
      else rollup.reading_amount >= 10
    end,
    case
      when rollup.invalidated or rollup.status = 'unscored' then false
      else rollup.diet_met
    end,
    rollup.status <> 'unscored'
  from private.day_rollup_unchecked(
    p_user_id,
    v_score_date,
    v_as_of
  ) as rollup;
end;
$$;

create or replace function public.get_daily_board_score(
  p_user_id uuid,
  p_as_of_instant timestamptz default now()
)
returns table (
  score_date date,
  goals_achieved_today integer,
  workout_met boolean,
  water_met boolean,
  reading_met boolean,
  diet_met boolean,
  eligible boolean
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
     or (
       auth.uid() <> p_user_id
       and not private.is_admin(auth.uid())
     ) then
    raise exception 'FORBIDDEN';
  end if;

  return query
  select *
  from private.daily_board_score_unchecked(
    p_user_id,
    p_as_of_instant
  );
end;
$$;

create or replace function public.get_member_daily_board_score(
  p_viewer_id uuid,
  p_user_id uuid,
  p_as_of_instant timestamptz default now()
)
returns table (
  score_date date,
  goals_achieved_today integer,
  workout_met boolean,
  water_met boolean,
  reading_met boolean,
  diet_met boolean,
  eligible boolean
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
  from private.daily_board_score_unchecked(
    p_user_id,
    p_as_of_instant
  );
end;
$$;

create or replace function public.get_daily_board_score(
  user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select to_jsonb(score)
      from public.get_daily_board_score($1, now()) as score
    ),
    '{}'::jsonb
  );
$$;

revoke all on function public.get_daily_board_score(uuid, timestamptz)
  from public;
revoke all on function public.get_daily_board_score(uuid)
  from public;
revoke all on function private.daily_board_score_unchecked(uuid, timestamptz)
  from public;
revoke all on function public.get_member_daily_board_score(
  uuid,
  uuid,
  timestamptz
)
  from public;
grant execute on function public.get_daily_board_score(uuid, timestamptz)
  to authenticated;
grant execute on function public.get_daily_board_score(uuid)
  to authenticated;
grant execute on function public.get_member_daily_board_score(
  uuid,
  uuid,
  timestamptz
)
  to authenticated;
