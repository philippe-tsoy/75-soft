-- 75 Soft W4 member-scoped read models.
--
-- W2 owns the canonical scoring implementation. These functions deliberately
-- call that implementation through a narrow RPC boundary instead of
-- reimplementing amount, diet, post, or invalidation scoring here.
--
-- The aggregate callers also require W2 to expose a trusted member-scoped
-- read boundary. The current owner/admin-scoped public RPCs can serve a
-- member's own Person read (or an admin read), but cannot score every active
-- member for a regular Board/Group Strip viewer.

begin;

create or replace function private.w4_read_member_allowed(
  p_viewer_id uuid,
  p_subject_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = public, private
as $$
  select
    auth.uid() is not null
    and auth.uid() = p_viewer_id
    and private.is_active_member(p_viewer_id)
    and (
      p_subject_id is null
      or private.is_active_member(p_subject_id)
    )
$$;

create or replace function private.w4_json_int(p_value jsonb)
returns integer
language plpgsql
immutable
security invoker
set search_path = public
as $$
begin
  if p_value is null or jsonb_typeof(p_value) not in ('number', 'string') then
    return null;
  end if;

  return (p_value #>> '{}')::integer;
exception
  when invalid_text_representation then
    return null;
end;
$$;

create or replace function private.w4_json_bool(p_value jsonb)
returns boolean
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  normalized text;
begin
  if p_value is null then
    return null;
  end if;

  if jsonb_typeof(p_value) = 'boolean' then
    return (p_value #>> '{}')::boolean;
  end if;

  if jsonb_typeof(p_value) <> 'string' then
    return null;
  end if;

  normalized := lower(p_value #>> '{}');
  if normalized = 'true' then
    return true;
  end if;
  if normalized = 'false' then
    return false;
  end if;

  return null;
end;
$$;

create or replace function private.w4_goal_state(
  p_score jsonb,
  p_key text
)
returns boolean
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  states jsonb;
  value jsonb;
begin
  states := coalesce(
    p_score -> 'goalStates',
    p_score -> 'goal_states',
    p_score -> 'goalDots',
    p_score -> 'goal_dots',
    p_score -> 'goals'
  );
  value := coalesce(
    states -> p_key,
    p_score -> (p_key || 'Met'),
    p_score -> (p_key || '_met')
  );

  if jsonb_typeof(value) = 'object' then
    value := coalesce(
      value -> 'met',
      value -> 'isMet',
      value -> 'is_met',
      value -> 'completed'
    );
  end if;

  if value is null then
    if p_key = 'workout' then
      return coalesce(private.w4_json_int(
        p_score -> 'workout_amount'
      ), 0) >= 45;
    elsif p_key = 'water' then
      return coalesce(private.w4_json_int(
        p_score -> 'water_amount'
      ), 0) >= 2000;
    elsif p_key = 'reading' then
      return coalesce(private.w4_json_int(
        p_score -> 'reading_amount'
      ), 0) >= 10;
    end if;
  end if;

  return coalesce(private.w4_json_bool(value), false);
end;
$$;

create or replace function private.w4_score_count(p_score jsonb)
returns integer
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  explicit_count integer;
begin
  explicit_count := private.w4_json_int(coalesce(
    p_score -> 'goalsAchievedToday',
    p_score -> 'goals_achieved_today',
    p_score -> 'metCount',
    p_score -> 'met_count'
  ));

  if explicit_count is not null then
    return greatest(0, least(4, explicit_count));
  end if;

  return
    (private.w4_goal_state(p_score, 'workout')::integer)
    + (private.w4_goal_state(p_score, 'water')::integer)
    + (private.w4_goal_state(p_score, 'reading')::integer)
    + (private.w4_goal_state(p_score, 'diet')::integer);
end;
$$;

create or replace function private.w4_score_date(
  p_score jsonb,
  p_fallback date
)
returns date
language plpgsql
immutable
security invoker
set search_path = public
as $$
declare
  value text;
begin
  value := coalesce(
    p_score ->> 'scoreDate',
    p_score ->> 'score_date',
    p_score ->> 'localDate',
    p_score ->> 'local_date'
  );

  if value is null then
    return p_fallback;
  end if;

  return value::date;
exception
  when invalid_text_representation then
    return p_fallback;
end;
$$;

create or replace function private.w4_daily_score(
  p_user_id uuid,
  p_as_of_instant timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  local_date date;
  raw_score jsonb;
  score_date date;
  score_count integer;
  eligible boolean;
begin
  select (
    coalesce(p_as_of_instant, now()) at time zone profile.timezone
  )::date
    into local_date
  from public.profiles as profile
  where profile.id = p_user_id;

  if local_date is null then
    raise exception 'Member profile was not found'
      using errcode = '42501';
  end if;

  -- W2 exposes a narrow member-scoped RPC for aggregate viewers. The older
  -- self/admin RPCs remain fallbacks for installations being upgraded.
  if to_regprocedure(
    'public.get_member_daily_board_score(uuid,uuid,timestamptz)'
  ) is not null then
    execute
      'select to_jsonb(score) ' ||
      'from public.get_member_daily_board_score($1, $2, $3) as score'
      into raw_score
      using auth.uid(), p_user_id, p_as_of_instant;
  elsif to_regprocedure(
    'public.get_daily_board_score(uuid,timestamptz)'
  ) is not null then
    execute
      'select to_jsonb(score) ' ||
      'from public.get_daily_board_score($1, $2) as score'
      into raw_score
      using p_user_id, p_as_of_instant;
  elsif to_regprocedure(
    'public.get_daily_board_score(uuid)'
  ) is not null then
    execute
      'select to_jsonb(score) ' ||
      'from public.get_daily_board_score($1) as score'
      into raw_score
      using p_user_id;
  elsif to_regprocedure(
    'public.get_day_rollup(uuid,date,timestamptz)'
  ) is not null then
    execute
      'select to_jsonb(rollup) ' ||
      'from public.get_day_rollup($1, $2, $3) as rollup'
      into raw_score
      using p_user_id, local_date, p_as_of_instant;
  elsif to_regprocedure(
    'public.get_day_rollup(uuid,date)'
  ) is not null then
    execute
      'select to_jsonb(rollup) ' ||
      'from public.get_day_rollup($1, $2) as rollup'
      into raw_score
      using p_user_id, local_date;
  else
    raise exception 'W2 scoring read service is unavailable'
      using errcode = 'P0001';
  end if;

  raw_score := coalesce(raw_score, '{}'::jsonb);
  score_date := private.w4_score_date(raw_score, local_date);
  score_count := private.w4_score_count(raw_score);
  eligible := coalesce(
    private.w4_json_bool(coalesce(
      raw_score -> 'eligible',
      raw_score -> 'boardEligible',
      raw_score -> 'board_eligible'
    )),
    true
  );

  return jsonb_build_object(
    'scoreDate', score_date,
    'goalsAchievedToday', score_count,
    'goalStates', jsonb_build_object(
      'workout', private.w4_goal_state(raw_score, 'workout'),
      'water', private.w4_goal_state(raw_score, 'water'),
      'reading', private.w4_goal_state(raw_score, 'reading'),
      'diet', private.w4_goal_state(raw_score, 'diet')
    ),
    'eligible', eligible
  );
end;
$$;

create or replace function private.w4_day_rollup(
  p_user_id uuid,
  p_local_date date,
  p_as_of_instant timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  rollup jsonb;
begin
  if to_regprocedure(
    'public.get_member_day_rollup(uuid,uuid,date,timestamptz)'
  ) is not null then
    execute
      'select to_jsonb(value) ' ||
      'from public.get_member_day_rollup($1, $2, $3, $4) as value'
      into rollup
      using auth.uid(), p_user_id, p_local_date, p_as_of_instant;
  elsif to_regprocedure(
    'public.get_day_rollup(uuid,date,timestamptz)'
  ) is not null then
    execute
      'select to_jsonb(value) ' ||
      'from public.get_day_rollup($1, $2, $3) as value'
      into rollup
      using p_user_id, p_local_date, p_as_of_instant;
  elsif to_regprocedure(
    'public.get_day_rollup(uuid,date)'
  ) is not null then
    execute
      'select to_jsonb(value) ' ||
      'from public.get_day_rollup($1, $2) as value'
      into rollup
      using p_user_id, p_local_date;
  else
    raise exception 'W2 day rollup service is unavailable'
      using errcode = 'P0001';
  end if;

  return coalesce(rollup, '{}'::jsonb);
end;
$$;

create or replace function private.w4_calendar(
  p_user_id uuid,
  p_from_date date,
  p_to_date date,
  p_as_of_instant timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  cells jsonb;
begin
  if p_from_date > p_to_date then
    return '[]'::jsonb;
  end if;

  if to_regprocedure(
    'public.get_member_calendar(uuid,uuid,date,date,timestamptz)'
  ) is not null then
    execute
      'select coalesce(jsonb_agg(to_jsonb(value)), ''[]''::jsonb) ' ||
      'from public.get_member_calendar($1, $2, $3, $4, $5) as value'
      into cells
      using auth.uid(), p_user_id, p_from_date, p_to_date, p_as_of_instant;
  elsif to_regprocedure(
    'public.get_calendar(uuid,date,date,timestamptz)'
  ) is not null then
    execute
      'select coalesce(jsonb_agg(to_jsonb(value)), ''[]''::jsonb) ' ||
      'from public.get_calendar($1, $2, $3, $4) as value'
      into cells
      using p_user_id, p_from_date, p_to_date, p_as_of_instant;
  elsif to_regprocedure(
    'public.get_calendar(uuid,date,date)'
  ) is not null then
    execute
      'select coalesce(jsonb_agg(to_jsonb(value)), ''[]''::jsonb) ' ||
      'from public.get_calendar($1, $2, $3) as value'
      into cells
      using p_user_id, p_from_date, p_to_date;
  else
    raise exception 'W2 calendar service is unavailable'
      using errcode = 'P0001';
  end if;

  return coalesce(cells, '[]'::jsonb);
end;
$$;

create or replace function private.w4_achievements(p_subject_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  achievements jsonb;
begin
  -- W6 owns the catalog and its hidden-entry masking policy.
  if to_regprocedure('public.get_member_achievements(uuid,uuid)') is not null then
    execute
      'select coalesce(jsonb_agg(to_jsonb(value)), ''[]''::jsonb) ' ||
      'from public.get_member_achievements($1, $2) as value'
      into achievements
      using auth.uid(), p_subject_id;
  elsif to_regprocedure('public.get_achievements(uuid)') is null then
    return '[]'::jsonb;
  else
    execute
      'select coalesce(jsonb_agg(to_jsonb(value)), ''[]''::jsonb) ' ||
      'from public.get_achievements($1) as value'
      into achievements
      using p_subject_id;
  end if;

  return coalesce(achievements, '[]'::jsonb);
end;
$$;

create or replace function private.w4_posts(
  p_viewer_id uuid,
  p_subject_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  posts jsonb;
begin
  -- W3 owns feed/social behavior. This read only projects published rows into
  -- the minimum PostDTO shape required by the Person screen.
  if to_regclass('public.posts') is null
    or to_regclass('public.post_goal_entries') is null then
    return '[]'::jsonb;
  end if;

  if to_regclass('public.optional_goals') is not null then
    execute $query$
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', post.id,
            'author', jsonb_build_object(
              'id', author.id,
              'displayName', author.display_name,
              'avatarUrl', null
            ),
            'localDate', post.local_date,
            'createdAt', post.created_at,
            'goals', coalesce(entries.goals, '[]'::jsonb),
            'note', post.note,
            'photoUrl', null,
            'reactions', '[]'::jsonb,
            'comments', '[]'::jsonb,
            'canDelete', post.author_id = $1 or private.is_admin($1)
          )
          order by post.created_at desc
        ),
        '[]'::jsonb
      )
      from public.posts as post
      join public.profiles as author on author.id = post.author_id
      left join lateral (
        select coalesce(
          jsonb_agg(
            case
              when entry.required_goal_key is not null then jsonb_build_object(
                'kind', 'required',
                'key', entry.required_goal_key,
                'amount', entry.amount_int,
                'unit', case entry.required_goal_key
                  when 'workout' then 'minutes'
                  when 'water' then 'ml'
                  when 'reading' then 'pages'
                  else 'attestation'
                end,
                'met', case
                  when entry.required_goal_key = 'diet'
                    then coalesce(entry.diet_value, false)
                  when entry.required_goal_key = 'workout'
                    then coalesce(entry.amount_int, 0) >= 45
                  when entry.required_goal_key = 'water'
                    then coalesce(entry.amount_int, 0) >= 2000
                  when entry.required_goal_key = 'reading'
                    then coalesce(entry.amount_int, 0) >= 10
                  else false
                end
              )
              else jsonb_build_object(
                'kind', 'optional',
                'optionalGoalId', entry.optional_goal_id,
                'name', coalesce(
                  entry.optional_goal_name,
                  optional_goal.name,
                  'Optional goal'
                ),
                'value', entry.optional_value,
                'completed', entry.optional_completed
              )
            end
            order by entry.created_at
          ),
          '[]'::jsonb
        ) as goals
        from public.post_goal_entries as entry
        left join public.optional_goals as optional_goal
          on optional_goal.id = entry.optional_goal_id
        where entry.post_id = post.id
      ) as entries on true
      where post.author_id = $2
        and post.cohort_id = private.active_cohort_id()
        and post.status = 'published'
    $query$
      into posts
      using p_viewer_id, p_subject_id;
  else
    execute $query$
      select coalesce(
        jsonb_agg(
          jsonb_build_object(
            'id', post.id,
            'author', jsonb_build_object(
              'id', author.id,
              'displayName', author.display_name,
              'avatarUrl', null
            ),
            'localDate', post.local_date,
            'createdAt', post.created_at,
            'goals', coalesce(entries.goals, '[]'::jsonb),
            'note', post.note,
            'photoUrl', null,
            'reactions', '[]'::jsonb,
            'comments', '[]'::jsonb,
            'canDelete', post.author_id = $1 or private.is_admin($1)
          )
          order by post.created_at desc
        ),
        '[]'::jsonb
      )
      from public.posts as post
      join public.profiles as author on author.id = post.author_id
      left join lateral (
        select coalesce(
          jsonb_agg(
            case
              when entry.required_goal_key is not null then jsonb_build_object(
                'kind', 'required',
                'key', entry.required_goal_key,
                'amount', entry.amount_int,
                'unit', case entry.required_goal_key
                  when 'workout' then 'minutes'
                  when 'water' then 'ml'
                  when 'reading' then 'pages'
                  else 'attestation'
                end,
                'met', case
                  when entry.required_goal_key = 'diet'
                    then coalesce(entry.diet_value, false)
                  when entry.required_goal_key = 'workout'
                    then coalesce(entry.amount_int, 0) >= 45
                  when entry.required_goal_key = 'water'
                    then coalesce(entry.amount_int, 0) >= 2000
                  when entry.required_goal_key = 'reading'
                    then coalesce(entry.amount_int, 0) >= 10
                  else false
                end
              )
              else jsonb_build_object(
                'kind', 'optional',
                'optionalGoalId', entry.optional_goal_id,
                'name', coalesce(entry.optional_goal_name, 'Optional goal'),
                'value', entry.optional_value,
                'completed', entry.optional_completed
              )
            end
            order by entry.created_at
          ),
          '[]'::jsonb
        ) as goals
        from public.post_goal_entries as entry
        where entry.post_id = post.id
      ) as entries on true
      where post.author_id = $2
        and post.cohort_id = private.active_cohort_id()
        and post.status = 'published'
    $query$
      into posts
      using p_viewer_id, p_subject_id;
  end if;

  return coalesce(posts, '[]'::jsonb);
end;
$$;

create or replace function public.get_group_strip(viewer_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.w4_read_member_allowed(viewer_id) then
    raise exception 'Active membership is required'
      using errcode = '42501';
  end if;

  return query
    with active_members as (
      select
        membership.user_id,
        membership.join_local_date,
        profile.display_name,
        profile.timezone,
        ((now() at time zone profile.timezone)::date) as local_date
      from public.memberships as membership
      join public.profiles as profile on profile.id = membership.user_id
      where membership.cohort_id = private.active_cohort_id()
        and membership.removed_at is null
    ),
    scored as (
      select
        active_members.*,
        private.w4_daily_score(active_members.user_id, now()) as score
      from active_members
    )
    select jsonb_build_object(
      'user', jsonb_build_object(
        'id', scored.user_id,
        'displayName', scored.display_name,
        'avatarUrl', null
      ),
      'localDate', scored.local_date,
      'dayNumber', scored.local_date - cohort.start_date + 1,
      'goalDots', jsonb_build_object(
        'workout', private.w4_goal_state(scored.score, 'workout'),
        'water', private.w4_goal_state(scored.score, 'water'),
        'reading', private.w4_goal_state(scored.score, 'reading'),
        'diet', private.w4_goal_state(scored.score, 'diet')
      ),
      'goalsAchievedToday', private.w4_score_count(scored.score),
      'scoreDate', private.w4_score_date(scored.score, scored.local_date)
    )
    from scored
    cross join (
      select start_date
      from public.cohorts
      where id = private.active_cohort_id()
    ) as cohort;
end;
$$;

create or replace function public.get_board(viewer_id uuid)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if not private.w4_read_member_allowed(viewer_id) then
    raise exception 'Active membership is required'
      using errcode = '42501';
  end if;

  return query
    with active_members as (
      select
        membership.user_id,
        profile.display_name,
        profile.timezone,
        ((now() at time zone profile.timezone)::date) as local_date
      from public.memberships as membership
      join public.profiles as profile on profile.id = membership.user_id
      where membership.cohort_id = private.active_cohort_id()
        and membership.removed_at is null
    ),
    scored as (
      select
        active_members.*,
        private.w4_daily_score(active_members.user_id, now()) as score
      from active_members
    ),
    ranked as (
      select
        scored.*,
        private.w4_score_count(scored.score) as score_count
      from scored
    )
    select jsonb_build_object(
      'rank', rank() over (order by ranked.score_count desc),
      'user', jsonb_build_object(
        'id', ranked.user_id,
        'displayName', ranked.display_name,
        'avatarUrl', null
      ),
      'goalsAchievedToday', ranked.score_count,
      'scoreDate', private.w4_score_date(ranked.score, ranked.local_date)
    )
    from ranked
    order by ranked.score_count desc;
end;
$$;

create or replace function public.get_person_summary(
  viewer_id uuid,
  subject_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  subject_profile record;
  subject_membership record;
  cohort_start date;
  score jsonb;
  score_date date;
  current_day jsonb;
  calendar jsonb;
begin
  if not private.w4_read_member_allowed(viewer_id, subject_id) then
    raise exception 'Active membership is required'
      using errcode = '42501';
  end if;

  select
    profile.id,
    profile.display_name,
    profile.timezone
    into subject_profile
  from public.profiles as profile
  where profile.id = subject_id;

  select membership.join_local_date
    into subject_membership
  from public.memberships as membership
  where membership.user_id = subject_id
    and membership.cohort_id = private.active_cohort_id()
    and membership.removed_at is null;

  if subject_profile.id is null or subject_membership.join_local_date is null then
    return null;
  end if;

  select start_date
    into cohort_start
  from public.cohorts
  where id = private.active_cohort_id();

  score := private.w4_daily_score(subject_id, now());
  score_date := private.w4_score_date(
    score,
    ((now() at time zone subject_profile.timezone)::date)
  );
  current_day := private.w4_day_rollup(subject_id, score_date, now());
  calendar := case
    when score_date >= cohort_start then private.w4_calendar(
      subject_id,
      cohort_start,
      score_date,
      now()
    )
    else '[]'::jsonb
  end;

  return jsonb_build_object(
    'profile', jsonb_build_object(
      'id', subject_profile.id,
      'displayName', subject_profile.display_name,
      'avatarUrl', null
    ),
    'goalsAchievedToday', private.w4_score_count(score),
    'calendar', calendar,
    'currentDay', current_day,
    'achievements', private.w4_achievements(subject_id),
    'posts', private.w4_posts(viewer_id, subject_id),
    'canEdit', viewer_id = subject_id
  );
end;
$$;

revoke all on function private.w4_read_member_allowed(uuid, uuid) from public;
revoke all on function private.w4_json_int(jsonb) from public;
revoke all on function private.w4_json_bool(jsonb) from public;
revoke all on function private.w4_goal_state(jsonb, text) from public;
revoke all on function private.w4_score_count(jsonb) from public;
revoke all on function private.w4_score_date(jsonb, date) from public;
revoke all on function private.w4_daily_score(uuid, timestamptz) from public;
revoke all on function private.w4_day_rollup(uuid, date, timestamptz) from public;
revoke all on function private.w4_calendar(uuid, date, date, timestamptz) from public;
revoke all on function private.w4_achievements(uuid) from public;
revoke all on function private.w4_posts(uuid, uuid) from public;

revoke all on function public.get_group_strip(uuid) from public;
revoke all on function public.get_board(uuid) from public;
revoke all on function public.get_person_summary(uuid, uuid) from public;
grant execute on function public.get_group_strip(uuid) to authenticated;
grant execute on function public.get_board(uuid) to authenticated;
grant execute on function public.get_person_summary(uuid, uuid) to authenticated;

commit;
