-- 75 Soft teams. Member-created, optional, one active team per member at a
-- time. Membership is effective-dated so a switch never rewrites a member's
-- historical attribution to the team(s) they were actually on when a goal-day
-- happened. All writes go through the security-definer functions below;
-- direct table INSERT/UPDATE/DELETE is not granted to members. See
-- 75-soft-spec/TEAMS_PERCENTAGE_AND_DAILY_PHOTO.md §2.

begin;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  cohort_id uuid not null references public.cohorts (id) on delete cascade,
  name text not null,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint teams_name_check check (
    char_length(btrim(name)) between 2 and 40
  )
);

-- Case-insensitive uniqueness per cohort. A team is never deleted (see the
-- product decision in the change spec), so this stays a plain unique index
-- rather than a partial one scoped to a "live" flag that does not exist.
create unique index if not exists teams_cohort_name_unique
  on public.teams (cohort_id, lower(name));

create index if not exists teams_cohort_idx
  on public.teams (cohort_id, created_at);

create table if not exists public.team_memberships (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  left_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint team_memberships_left_after_joined_check check (
    left_at is null or left_at >= joined_at
  )
);

-- At most one active (left_at is null) team per member.
create unique index if not exists team_memberships_active_user_unique
  on public.team_memberships (user_id)
  where left_at is null;

create index if not exists team_memberships_team_active_idx
  on public.team_memberships (team_id, left_at);

create index if not exists team_memberships_user_history_idx
  on public.team_memberships (user_id, joined_at);

alter table public.teams enable row level security;
alter table public.team_memberships enable row level security;

-- Rosters are public within the group, same as every other group aggregate.
drop policy if exists teams_member_select on public.teams;
create policy teams_member_select
on public.teams
for select
to authenticated
using (
  cohort_id = private.active_cohort_id()
  and private.is_active_member(auth.uid())
);

drop policy if exists team_memberships_member_select on public.team_memberships;
create policy team_memberships_member_select
on public.team_memberships
for select
to authenticated
using (
  private.is_active_member(auth.uid())
  and exists (
    select 1
    from public.teams as team
    where team.id = team_memberships.team_id
      and team.cohort_id = private.active_cohort_id()
  )
);

-- No insert/update/delete policies: the "at most one active team" invariant
-- and the effective-dated switch need one atomic transition, so every write
-- goes through the security-definer functions below instead of direct table
-- access (the same shape as the diet toggle in day_mutations.sql).
revoke all on public.teams from anon, authenticated;
revoke all on public.team_memberships from anon, authenticated;
grant select on public.teams to authenticated;
grant select on public.team_memberships to authenticated;

-- Closes the caller's current active membership (if any) and opens a new one
-- on p_team_id. A no-op if they are already on that team. Not exposed
-- directly; callers go through create_team/join_team below.
create or replace function private.join_team_unchecked(
  p_user_id uuid,
  p_team_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  update public.team_memberships
  set left_at = now()
  where user_id = p_user_id
    and left_at is null
    and team_id <> p_team_id;

  if not exists (
    select 1
    from public.team_memberships
    where user_id = p_user_id
      and team_id = p_team_id
      and left_at is null
  ) then
    insert into public.team_memberships (team_id, user_id, joined_at)
    values (p_team_id, p_user_id, now());
  end if;
end;
$$;

revoke all on function private.join_team_unchecked(uuid, uuid) from public;

create or replace function public.create_team(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_trimmed text := btrim(coalesce(p_name, ''));
  v_cohort_id uuid;
  v_team_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not private.is_active_member(auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;

  if char_length(v_trimmed) < 2 or char_length(v_trimmed) > 40 then
    raise exception 'VALIDATION_ERROR' using errcode = '23514';
  end if;

  v_cohort_id := private.active_cohort_id();

  if exists (
    select 1
    from public.teams
    where cohort_id = v_cohort_id
      and lower(name) = lower(v_trimmed)
  ) then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  insert into public.teams (cohort_id, name, created_by)
  values (v_cohort_id, v_trimmed, auth.uid())
  returning id into v_team_id;

  perform private.join_team_unchecked(auth.uid(), v_team_id);

  return v_team_id;
end;
$$;

create or replace function public.join_team(p_team_id uuid)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not private.is_active_member(auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1
    from public.teams
    where id = p_team_id
      and cohort_id = private.active_cohort_id()
  ) then
    raise exception 'NOT_FOUND';
  end if;

  perform private.join_team_unchecked(auth.uid(), p_team_id);
end;
$$;

-- Self-leave by default. Admin may pass a different p_user_id to remove one
-- specific member from their current team -- the only moderation lever for
-- teams; there is deliberately no bulk "archive/evict a team" action.
create or replace function public.leave_team(p_user_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_target uuid := coalesce(p_user_id, auth.uid());
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if v_target <> auth.uid() and not private.is_admin(auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;

  update public.team_memberships
  set left_at = now()
  where user_id = v_target
    and left_at is null;
end;
$$;

create or replace function public.rename_team(p_team_id uuid, p_name text)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_trimmed text := btrim(coalesce(p_name, ''));
  v_cohort_id uuid;
  v_created_by uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select cohort_id, created_by
  into v_cohort_id, v_created_by
  from public.teams
  where id = p_team_id;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if auth.uid() <> v_created_by and not private.is_admin(auth.uid()) then
    raise exception 'FORBIDDEN';
  end if;

  if char_length(v_trimmed) < 2 or char_length(v_trimmed) > 40 then
    raise exception 'VALIDATION_ERROR' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.teams
    where cohort_id = v_cohort_id
      and id <> p_team_id
      and lower(name) = lower(v_trimmed)
  ) then
    raise exception 'CONFLICT' using errcode = '23505';
  end if;

  update public.teams set name = v_trimmed where id = p_team_id;
end;
$$;

revoke all on function public.create_team(text) from public;
revoke all on function public.join_team(uuid) from public;
revoke all on function public.leave_team(uuid) from public;
revoke all on function public.rename_team(uuid, text) from public;
grant execute on function public.create_team(text) to authenticated;
grant execute on function public.join_team(uuid) to authenticated;
grant execute on function public.leave_team(uuid) to authenticated;
grant execute on function public.rename_team(uuid, text) to authenticated;

-- Cumulative, tenure-weighted team percentage: pools every member's
-- required-goal-days for the exact date ranges they were actually on this
-- team (see 75-soft-spec/TEAMS_PERCENTAGE_AND_DAILY_PHOTO.md §3.1). Reuses
-- private.day_rollup_unchecked per date rather than re-deriving scoring
-- rules, the same way public.get_calendar already ranges over it.
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

    select coalesce(sum(rollup.met_count), 0), count(*) * 4
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

revoke all on function private.team_percentage_unchecked(uuid, timestamptz)
  from public;

-- "Live" teams only: at least one currently active member. A team every
-- member has voluntarily left simply stops being returned here -- there is
-- no archived flag to maintain (see 75-soft-spec §2.1/§2.2).
create or replace function public.get_team_board(
  p_viewer_id uuid,
  p_as_of_instant timestamptz default now()
)
returns table (
  team_id uuid,
  name text,
  member_count integer,
  pct integer
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_team record;
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

  for v_team in
    select team.id, team.name
    from public.teams as team
    where team.cohort_id = private.active_cohort_id()
      and exists (
        select 1
        from public.team_memberships as membership
        where membership.team_id = team.id
          and membership.left_at is null
      )
  loop
    return query
    select v_team.id, v_team.name, pct.member_count, pct.pct
    from private.team_percentage_unchecked(v_team.id, p_as_of_instant) as pct;
  end loop;
end;
$$;

-- Team detail: header stats plus the current roster with each member's own
-- percentage and today's four-goal state, for the pushed Team screen.
create or replace function public.get_team_summary(
  p_viewer_id uuid,
  p_team_id uuid,
  p_as_of_instant timestamptz default now()
)
returns table (
  team_id uuid,
  name text,
  created_by uuid,
  member_count integer,
  pct integer,
  roster jsonb
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_team public.teams%rowtype;
  v_pct record;
  v_roster jsonb;
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

  select * into v_team
  from public.teams
  where id = p_team_id
    and cohort_id = private.active_cohort_id();

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  select * into v_pct
  from private.team_percentage_unchecked(p_team_id, p_as_of_instant);

  select coalesce(jsonb_agg(member_row order by member_row->>'userId'), '[]'::jsonb)
  into v_roster
  from (
    select jsonb_build_object(
      'userId', membership.user_id,
      'individualPct', member_pct.pct,
      'goalsAchievedToday', board.goals_achieved_today
    ) as member_row
    from public.team_memberships as membership
    cross join lateral private.member_percentage_unchecked(
      membership.user_id,
      p_as_of_instant
    ) as member_pct
    cross join lateral private.daily_board_score_unchecked(
      membership.user_id,
      p_as_of_instant
    ) as board
    where membership.team_id = p_team_id
      and membership.left_at is null
  ) as members(member_row);

  return query
  select
    v_team.id,
    v_team.name,
    v_team.created_by,
    v_pct.member_count,
    v_pct.pct,
    v_roster;
end;
$$;

-- The caller's own current team (or an empty result if teamless).
create or replace function public.get_my_team(
  p_viewer_id uuid,
  p_as_of_instant timestamptz default now()
)
returns table (
  team_id uuid,
  name text,
  individual_pct integer,
  team_pct integer
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
declare
  v_team_id uuid;
  v_team_name text;
  v_individual_pct integer;
  v_team_pct integer;
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

  select team.id, team.name
  into v_team_id, v_team_name
  from public.team_memberships as membership
  join public.teams as team on team.id = membership.team_id
  where membership.user_id = p_viewer_id
    and membership.left_at is null
  limit 1;

  if not found then
    return;
  end if;

  select pct.pct into v_individual_pct
  from private.member_percentage_unchecked(p_viewer_id, p_as_of_instant) as pct;

  select pct.pct into v_team_pct
  from private.team_percentage_unchecked(v_team_id, p_as_of_instant) as pct;

  return query
  select v_team_id, v_team_name, v_individual_pct, v_team_pct;
end;
$$;

revoke all on function public.get_team_board(uuid, timestamptz) from public;
revoke all on function public.get_team_summary(uuid, uuid, timestamptz)
  from public;
revoke all on function public.get_my_team(uuid, timestamptz) from public;
grant execute on function public.get_team_board(uuid, timestamptz)
  to authenticated;
grant execute on function public.get_team_summary(uuid, uuid, timestamptz)
  to authenticated;
grant execute on function public.get_my_team(uuid, timestamptz)
  to authenticated;

commit;
