-- Forward-compatible W4 read-model updates for the W2/W6 member boundaries.

-- Superseded by the identical definition in read_models_flat_goals.sql
-- (\ir'd later, from 0018_flat_goals.sql) -- kept here too, matching, so
-- this canonical file never reads as stale between the two \ir points on a
-- fresh deploy.
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
  select to_jsonb(value)
  into rollup
  from private.day_rollup_unchecked(
    p_user_id,
    p_local_date,
    p_as_of_instant
  ) as value;

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
language sql
stable
security definer
set search_path = public, private
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'localDate', rollup.local_date,
        'dayNumber', rollup.day_number,
        'status', rollup.status,
        'metCount', rollup.met_count,
        'editable', rollup.editable,
        'invalidated', rollup.invalidated
      )
      order by rollup.local_date
    ),
    '[]'::jsonb
  )
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
  if to_regprocedure('public.get_member_achievements(uuid,uuid)') is null then
    return '[]'::jsonb;
  end if;

  execute
    'select coalesce(jsonb_agg(to_jsonb(value)), ''[]''::jsonb) ' ||
    'from public.get_member_achievements($1, $2) as value'
    into achievements
    using auth.uid(), p_subject_id;

  return coalesce(achievements, '[]'::jsonb);
end;
$$;

revoke all on function private.w4_daily_score(uuid, timestamptz) from public;
revoke all on function private.w4_day_rollup(uuid, date, timestamptz)
  from public;
revoke all on function private.w4_calendar(uuid, date, date, timestamptz)
  from public;
revoke all on function private.w4_achievements(uuid) from public;
