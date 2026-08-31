-- Shared W2 database helpers. These functions are security-definer and never
-- trust a client-supplied actor id for mutations.

create or replace function private.day_is_editable(
  p_user_id uuid,
  p_local_date date,
  p_as_of timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_member boolean;
  v_is_invalidated boolean := false;
  v_as_of timestamptz := coalesce(p_as_of, now());
begin
  select exists (
    select 1
    from public.profiles as profile
    join public.memberships as membership
      on membership.user_id = profile.id
    join public.cohorts as cohort
      on cohort.id = membership.cohort_id
     and cohort.is_active = true
    where profile.id = p_user_id
      and membership.removed_at is null
      and p_local_date >= cohort.start_date
      and p_local_date >= membership.join_local_date
      and p_local_date in (
        timezone(profile.timezone, v_as_of)::date,
        timezone(profile.timezone, v_as_of)::date - 1
      )
  )
  into v_is_member;

  if not v_is_member then
    return false;
  end if;

  -- Moderation owns day_overrides in a later migration. W2 remains usable
  -- before that table exists and starts honoring it as soon as it is present.
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
    into v_is_invalidated
    using p_user_id, p_local_date, v_as_of;
  end if;

  return not v_is_invalidated;
end;
$$;

create or replace function private.day_latest_diet_state(
  p_user_id uuid,
  p_local_date date,
  p_as_of timestamptz default now()
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_state boolean;
  v_as_of timestamptz := coalesce(p_as_of, now());
begin
  /*
   * W3 may not have created posts yet. Dynamic SQL keeps W2 deployable on its
   * own; once those tables exist, published post diet entries participate in
   * the same deterministic latest-event ordering as quiet toggles.
   */
  if to_regclass('public.posts') is not null
     and to_regclass('public.post_goal_entries') is not null then
    execute $query$
      select event.diet_value
      from (
        select delta.diet_value,
               delta.created_at as event_at,
               delta.id as event_id
        from public.day_deltas as delta
        where delta.user_id = $1
          and delta.local_date = $2
          and delta.goal_key = 'diet'
          and delta.created_at <= $3

        union all

        select entry.diet_value,
               coalesce(post.published_at, post.created_at) as event_at,
               entry.id as event_id
        from public.posts as post
        join public.post_goal_entries as entry
          on entry.post_id = post.id
        where post.author_id = $1
          and post.local_date = $2
          and post.status = 'published'
          and entry.required_goal_key = 'diet'
          and entry.diet_value is true
          and coalesce(post.published_at, post.created_at) <= $3
      ) as event
      order by event.event_at desc, event.event_id desc
      limit 1
    $query$
    into v_state
    using p_user_id, p_local_date, v_as_of;
  else
    select delta.diet_value
    into v_state
    from public.day_deltas as delta
    where delta.user_id = p_user_id
      and delta.local_date = p_local_date
      and delta.goal_key = 'diet'
      and delta.created_at <= v_as_of
    order by delta.created_at desc, delta.id desc
    limit 1;
  end if;

  return coalesce(v_state, false);
end;
$$;

create or replace function private.day_assert_active_actor(
  p_user_id uuid,
  p_local_date date
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if auth.uid() <> p_user_id then
    raise exception 'ACTOR_MISMATCH';
  end if;

  if not private.is_active_member(p_user_id) then
    raise exception 'FORBIDDEN';
  end if;

  if not private.day_is_editable(p_user_id, p_local_date, now()) then
    raise exception 'DATE_NOT_EDITABLE';
  end if;
end;
$$;

create or replace function private.day_seed_default_containers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cohort_id = private.active_cohort_id()
     and new.removed_at is null
     and not exists (
       select 1
       from public.water_containers as container
       where container.owner_id = new.user_id
     ) then
    insert into public.water_containers (owner_id, label, volume_ml, sort_order)
    values
      (new.user_id, 'Glass', 250, 0),
      (new.user_id, 'Bottle', 500, 1);
  end if;

  return new;
end;
$$;

revoke all on function private.day_is_editable(uuid, date, timestamptz)
  from public;
revoke all on function private.day_latest_diet_state(uuid, date, timestamptz)
  from public;
revoke all on function private.day_assert_active_actor(uuid, date)
  from public;
revoke all on function private.day_seed_default_containers()
  from public;
