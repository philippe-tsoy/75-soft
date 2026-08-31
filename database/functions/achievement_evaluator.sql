-- Achievement evaluation functions.
-- Apply this file after the day-tracking and post migrations. The evaluator
-- reads their public projections and never deletes an existing unlock.

create or replace function private.achievement_day_facts(
  p_user_id uuid,
  p_local_date date,
  p_as_of timestamptz
)
returns table(
  workout_met boolean,
  water_met boolean,
  reading_met boolean,
  diet_met boolean,
  met_count integer,
  status text,
  invalidated boolean
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  rollup record;
begin
  select *
  into rollup
  from public.get_day_rollup(p_user_id, p_local_date, p_as_of);

  if not found then
    workout_met := false;
    water_met := false;
    reading_met := false;
    diet_met := false;
    met_count := 0;
    status := 'unscored';
    invalidated := false;
    return next;
    return;
  end if;

  workout_met := coalesce(rollup.workout_amount >= 45, false);
  water_met := coalesce(rollup.water_amount >= 2_000, false);
  reading_met := coalesce(rollup.reading_amount >= 10, false);
  diet_met := coalesce(rollup.diet_met, false);
  met_count := coalesce(rollup.met_count, 0);
  status := coalesce(rollup.status, 'unscored');
  invalidated := coalesce(rollup.invalidated, false);

  return next;
end;
$$;

create or replace function private.achievement_water_flags(
  p_user_id uuid,
  p_timezone text,
  p_from_date date,
  p_to_date date,
  p_as_of timestamptz
)
returns table(
  water_before_noon boolean,
  water_exact_target boolean
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  event_row record;
  event_date date;
  total_ml bigint := 0;
begin
  water_before_noon := false;
  water_exact_target := false;

  for event_row in
    select
      source.local_date,
      source.event_at,
      source.event_id,
      source.amount_ml
    from (
      select
        delta.local_date,
        delta.created_at as event_at,
        delta.id as event_id,
        delta.amount_int as amount_ml
      from public.day_deltas as delta
      where delta.user_id = p_user_id
        and delta.goal_key = 'water'
        and delta.created_at <= p_as_of
      union all
      select
        post.local_date,
        coalesce(post.published_at, post.created_at) as event_at,
        entry.id as event_id,
        entry.amount_int as amount_ml
      from public.post_goal_entries as entry
      join public.posts as post on post.id = entry.post_id
      where post.author_id = p_user_id
        and post.cohort_id = private.active_cohort_id()
        and post.status = 'published'
        and entry.required_goal_key = 'water'
        and coalesce(post.published_at, post.created_at) <= p_as_of
    ) as source
    where source.local_date >= p_from_date
      and source.local_date <= p_to_date
      and not exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = p_user_id
          and day_override.local_date = source.local_date
          and day_override.kind = 'invalidated'
      )
    order by source.local_date, source.event_at, source.event_id
  loop
    if event_date is distinct from event_row.local_date then
      event_date := event_row.local_date;
      total_ml := 0;
    end if;

    total_ml := total_ml + event_row.amount_ml;

    if
      total_ml >= 2_000
      and extract(
        hour from (event_row.event_at at time zone p_timezone)
      ) < 12
    then
      water_before_noon := true;
    end if;

    if total_ml = 2_000 then
      water_exact_target := true;
    end if;
  end loop;

  return next;
end;
$$;

create or replace function private.achievement_candidate_codes(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table(code text)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  user_timezone text;
  join_date date;
  cohort_start date;
  local_today date;
  current_day_number integer;
  first_update boolean := false;
  first_full_day boolean := false;
  first_photo boolean := false;
  three_posts_one_day boolean := false;
  water_before_noon boolean := false;
  full_day_after_miss boolean := false;
  workout_reading_one_post boolean := false;
  seven_photos boolean := false;
  water_exact_target boolean := false;
  water_flags record;
  date_row record;
  day_facts record;
  previous_day_facts record;
begin
  select
    profile.timezone,
    membership.join_local_date,
    cohort.start_date
  into
    user_timezone,
    join_date,
    cohort_start
  from public.memberships as membership
  join public.profiles as profile on profile.id = membership.user_id
  join public.cohorts as cohort on cohort.id = membership.cohort_id
  where membership.user_id = p_user_id
    and membership.cohort_id = private.active_cohort_id()
    and membership.removed_at is null;

  if not found then
    return;
  end if;

  local_today := (p_now at time zone user_timezone)::date;
  current_day_number := local_today - cohort_start + 1;

  first_update := exists (
    select 1
    from public.posts as post
    where post.author_id = p_user_id
      and post.cohort_id = private.active_cohort_id()
      and post.status = 'published'
      and post.local_date >= greatest(join_date, cohort_start)
      and post.local_date <= local_today
      and coalesce(post.published_at, post.created_at) <= p_now
      and not exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = p_user_id
          and day_override.local_date = post.local_date
          and day_override.kind = 'invalidated'
      )
  );

  first_photo := exists (
    select 1
    from public.posts as post
    where post.author_id = p_user_id
      and post.cohort_id = private.active_cohort_id()
      and post.status = 'published'
      and post.photo_path is not null
      and post.local_date >= greatest(join_date, cohort_start)
      and post.local_date <= local_today
      and coalesce(post.published_at, post.created_at) <= p_now
      and not exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = p_user_id
          and day_override.local_date = post.local_date
          and day_override.kind = 'invalidated'
      )
  );

  three_posts_one_day := exists (
    select 1
    from public.posts as post
    where post.author_id = p_user_id
      and post.cohort_id = private.active_cohort_id()
      and post.status = 'published'
      and post.local_date >= greatest(join_date, cohort_start)
      and post.local_date <= local_today
      and coalesce(post.published_at, post.created_at) <= p_now
      and not exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = p_user_id
          and day_override.local_date = post.local_date
          and day_override.kind = 'invalidated'
      )
    group by post.local_date
    having count(*) >= 3
  );

  workout_reading_one_post := exists (
    select 1
    from public.posts as post
    where post.author_id = p_user_id
      and post.cohort_id = private.active_cohort_id()
      and post.status = 'published'
      and post.local_date >= greatest(join_date, cohort_start)
      and post.local_date <= local_today
      and coalesce(post.published_at, post.created_at) <= p_now
      and not exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = p_user_id
          and day_override.local_date = post.local_date
          and day_override.kind = 'invalidated'
      )
      and exists (
        select 1
        from public.post_goal_entries as workout_entry
        where workout_entry.post_id = post.id
          and workout_entry.required_goal_key = 'workout'
      )
      and exists (
        select 1
        from public.post_goal_entries as reading_entry
        where reading_entry.post_id = post.id
          and reading_entry.required_goal_key = 'reading'
      )
  );

  seven_photos := (
    select count(*) >= 7
    from public.posts as post
    where post.author_id = p_user_id
      and post.cohort_id = private.active_cohort_id()
      and post.status = 'published'
      and post.photo_path is not null
      and post.local_date >= greatest(join_date, cohort_start)
      and post.local_date <= local_today
      and coalesce(post.published_at, post.created_at) <= p_now
      and not exists (
        select 1
        from public.day_overrides as day_override
        where day_override.user_id = p_user_id
          and day_override.local_date = post.local_date
          and day_override.kind = 'invalidated'
      )
  );

  select *
  into water_flags
  from private.achievement_water_flags(
    p_user_id,
    user_timezone,
    greatest(join_date, cohort_start),
    local_today,
    p_now
  );

  water_before_noon := water_flags.water_before_noon;
  water_exact_target := water_flags.water_exact_target;

  for date_row in
    select dates.local_date
    from (
      select delta.local_date
      from public.day_deltas as delta
      where delta.user_id = p_user_id
      union
      select post.local_date
      from public.posts as post
      where post.author_id = p_user_id
        and post.cohort_id = private.active_cohort_id()
    ) as dates
    where dates.local_date >= greatest(join_date, cohort_start)
      and dates.local_date <= local_today
    order by dates.local_date
  loop
    select *
    into day_facts
    from private.achievement_day_facts(
      p_user_id,
      date_row.local_date,
      p_now
    );

    if
      day_facts.met_count = 4
      and day_facts.status = 'complete'
      and not day_facts.invalidated
    then
      first_full_day := true;

      select *
      into previous_day_facts
      from private.achievement_day_facts(
        p_user_id,
        date_row.local_date - 1,
        p_now
      );

      if
        date_row.local_date - 1 < local_today
        and date_row.local_date - 1 >= greatest(join_date, cohort_start)
        and previous_day_facts.status = 'missed'
        and previous_day_facts.met_count = 0
        and not previous_day_facts.invalidated
      then
        full_day_after_miss := true;
      end if;
    end if;
  end loop;

  if first_update then
    return query select 'FIRST_UPDATE'::text;
  end if;
  if first_full_day then
    return query select 'FIRST_FULL_DAY'::text;
  end if;
  if first_photo then
    return query select 'FIRST_PHOTO'::text;
  end if;
  if current_day_number >= 75 then
    return query select 'DAY_75'::text;
  end if;
  if three_posts_one_day then
    return query select 'THREE_POSTS_ONE_DAY'::text;
  end if;
  if water_before_noon then
    return query select 'WATER_BEFORE_NOON'::text;
  end if;
  if full_day_after_miss then
    return query select 'FULL_DAY_AFTER_MISS'::text;
  end if;
  if workout_reading_one_post then
    return query select 'WORKOUT_READING_ONE_POST'::text;
  end if;
  if seven_photos then
    return query select 'SEVEN_PHOTOS'::text;
  end if;
  if water_exact_target then
    return query select 'WATER_EXACT_TARGET'::text;
  end if;
end;
$$;

revoke all on function private.achievement_day_facts(uuid, date, timestamptz)
  from public;
revoke all on function private.achievement_water_flags(
  uuid,
  text,
  date,
  date,
  timestamptz
)
  from public;
revoke all on function private.achievement_candidate_codes(
  uuid,
  timestamptz
)
  from public;

create or replace function public.evaluate_achievements(
  p_user_id uuid,
  p_now timestamptz default now()
)
returns table(
  achievement_id uuid,
  code text,
  unlocked_at timestamptz
)
language plpgsql
security definer
set search_path = public, private
as $$
declare
  candidate record;
  inserted_at timestamptz;
begin
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'Achievement evaluation is limited to the current user'
      using errcode = '42501';
  end if;

  if not private.is_active_member(p_user_id) then
    return;
  end if;

  for candidate in
    select achievement.id, achievement.code
    from public.achievements as achievement
    where achievement.code in (
      select candidate_code.code
      from private.achievement_candidate_codes(p_user_id, p_now)
        as candidate_code
    )
    order by achievement.sort_order
  loop
    insert into public.user_achievements (
      user_id,
      achievement_id,
      unlocked_at,
      evidence
    )
    values (
      p_user_id,
      candidate.id,
      p_now,
      jsonb_build_object('evaluatedAt', p_now)
    )
    on conflict (user_id, achievement_id) do nothing
    returning unlocked_at into inserted_at;

    if found then
      achievement_id := candidate.id;
      code := candidate.code;
      unlocked_at := inserted_at;
      return next;
    end if;
  end loop;
end;
$$;

revoke all on function public.evaluate_achievements(uuid, timestamptz)
  from public;
grant execute on function public.evaluate_achievements(uuid, timestamptz)
  to authenticated;
