-- Public achievement projection. Hidden locked copy is intentionally masked
-- here as well as in the TypeScript DTO adapter.

create or replace function public.get_achievements(
  p_user_id uuid
)
returns table(
  code text,
  title text,
  description text,
  is_hidden boolean,
  unlocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED'
      using errcode = '42501';
  end if;

  if not private.is_active_member(auth.uid())
     or not private.is_active_member(p_user_id)
     or (
       auth.uid() <> p_user_id
       and not private.is_admin(auth.uid())
     )
  then
    raise exception 'Achievement access requires an active member'
      using errcode = '42501';
  end if;

  return query
  select
    achievement.code,
    case
      when achievement.is_hidden and user_achievement.user_id is null
        then '???'
      else achievement.title
    end,
    case
      when achievement.is_hidden and user_achievement.user_id is null
        then '???'
      else achievement.description
    end,
    achievement.is_hidden,
    user_achievement.unlocked_at
  from public.achievements as achievement
  left join public.user_achievements as user_achievement
    on user_achievement.achievement_id = achievement.id
    and user_achievement.user_id = p_user_id
  order by achievement.sort_order;
end;
$$;

revoke all on function public.get_achievements(uuid) from public;
grant execute on function public.get_achievements(uuid) to authenticated;

create or replace function public.get_member_achievements(
  p_viewer_id uuid,
  p_user_id uuid
)
returns table(
  code text,
  title text,
  description text,
  is_hidden boolean,
  unlocked_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null
     or p_viewer_id is null
     or p_user_id is null
     or auth.uid() <> p_viewer_id
     or not private.is_active_member(p_viewer_id)
     or not private.is_active_member(p_user_id)
  then
    raise exception 'Achievement access requires an active member'
      using errcode = '42501';
  end if;

  return query
  select
    achievement.code,
    case
      when achievement.is_hidden and user_achievement.user_id is null
        then '???'
      else achievement.title
    end,
    case
      when achievement.is_hidden and user_achievement.user_id is null
        then '???'
      else achievement.description
    end,
    achievement.is_hidden,
    user_achievement.unlocked_at
  from public.achievements as achievement
  left join public.user_achievements as user_achievement
    on user_achievement.achievement_id = achievement.id
    and user_achievement.user_id = p_user_id
  order by achievement.sort_order;
end;
$$;

revoke all on function public.get_member_achievements(uuid, uuid) from public;
grant execute on function public.get_member_achievements(uuid, uuid)
  to authenticated;
