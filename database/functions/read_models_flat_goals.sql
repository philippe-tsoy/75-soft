-- Updates the W4 read-model layer (originally defined inline in
-- 0004_read_models.sql, which is historical and not re-run) for the flat
-- goals model: w4_goal_state/w4_score_count's fixed-4-key indirection is
-- retired in favor of reading met_count/total_count straight off the
-- rollup, the board's per-goal dot row goes away, and w4_posts renders any
-- goal generically instead of switching on a fixed key.

drop function if exists private.w4_goal_state(jsonb, text);
drop function if exists private.w4_score_count(jsonb);

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
  score jsonb;
begin
  select jsonb_build_object(
    'scoreDate', value.score_date,
    'metCount', value.met_count,
    'totalCount', value.total_count,
    'eligible', value.eligible
  )
  into score
  from private.daily_board_score_unchecked(
    p_user_id,
    p_as_of_instant
  ) as value;

  return coalesce(score, '{}'::jsonb);
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
      'metCount', coalesce((scored.score ->> 'metCount')::integer, 0),
      'totalCount', coalesce((scored.score ->> 'totalCount')::integer, 0),
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
        coalesce((scored.score ->> 'metCount')::integer, 0) as met_count,
        coalesce((scored.score ->> 'totalCount')::integer, 0) as total_count
      from scored
    )
    select jsonb_build_object(
      'rank', rank() over (
        order by
          case when ranked.total_count = 0 then -1
          else ranked.met_count::numeric / ranked.total_count end desc
      ),
      'user', jsonb_build_object(
        'id', ranked.user_id,
        'displayName', ranked.display_name,
        'avatarUrl', null
      ),
      'metCount', ranked.met_count,
      'totalCount', ranked.total_count,
      'scoreDate', private.w4_score_date(ranked.score, ranked.local_date)
    )
    from ranked
    order by
      case when ranked.total_count = 0 then -1
      else ranked.met_count::numeric / ranked.total_count end desc;
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
  -- Feed (posts/post_goal_entries) is an optional later-workstream source.
  -- This read only projects published rows into the minimum PostDTO shape
  -- required by the Person screen.
  if to_regclass('public.posts') is null
    or to_regclass('public.post_goal_entries') is null then
    return '[]'::jsonb;
  end if;

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
            -- Frozen legacy rows from before the flat-goals model; the
            -- fixed unit/met rules here are display-only and never change.
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
              'name', coalesce(entry.optional_goal_name, 'Goal'),
              'value', entry.optional_value,
              'completed', entry.optional_completed,
              'met', entry.met
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

  return coalesce(posts, '[]'::jsonb);
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
    'metCount', coalesce((score ->> 'metCount')::integer, 0),
    'totalCount', coalesce((score ->> 'totalCount')::integer, 0),
    'calendar', calendar,
    'currentDay', current_day,
    'achievements', private.w4_achievements(subject_id),
    'posts', private.w4_posts(viewer_id, subject_id),
    'canEdit', viewer_id = subject_id
  );
end;
$$;

revoke all on function private.w4_daily_score(uuid, timestamptz) from public;
revoke all on function private.w4_posts(uuid, uuid) from public;
revoke all on function public.get_group_strip(uuid) from public;
revoke all on function public.get_board(uuid) from public;
revoke all on function public.get_person_summary(uuid, uuid) from public;
grant execute on function public.get_group_strip(uuid) to authenticated;
grant execute on function public.get_board(uuid) to authenticated;
grant execute on function public.get_person_summary(uuid, uuid) to authenticated;
