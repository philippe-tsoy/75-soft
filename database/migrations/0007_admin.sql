-- 75 Soft administrator and moderation controls.
-- All mutating entry points below perform their own database-side admin check.
-- Clear invite codes are supplied only by the server and are never written to
-- audit metadata.

begin;

alter table public.signup_intents
  add column if not exists invalidated_at timestamptz null;

create index if not exists signup_intents_active_invite_idx
  on public.signup_intents (invite_digest, expires_at)
  where consumed_at is null and invalidated_at is null;

create table if not exists public.day_overrides (
  user_id uuid not null references public.profiles (id) on delete cascade,
  local_date date not null,
  kind text not null default 'invalidated',
  reason text null,
  created_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, local_date),
  constraint day_overrides_kind_check check (kind = 'invalidated'),
  constraint day_overrides_reason_check check (
    reason is null or char_length(reason) <= 500
  )
);

create index if not exists day_overrides_local_date_idx
  on public.day_overrides (local_date, user_id);

alter table public.day_overrides enable row level security;

drop policy if exists day_overrides_admin_select on public.day_overrides;
create policy day_overrides_admin_select
on public.day_overrides
for select
to authenticated
using (private.is_admin(auth.uid()));

revoke all on public.day_overrides from anon;
grant select on public.day_overrides to authenticated;

create or replace function private.is_day_invalidated(
  p_user_id uuid,
  p_local_date date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.day_overrides as override
    where override.user_id = p_user_id
      and override.local_date = p_local_date
      and override.kind = 'invalidated'
  )
$$;

revoke all on function private.is_day_invalidated(uuid, date) from public;
grant execute on function private.is_day_invalidated(uuid, date) to authenticated;

create or replace function private.assert_admin()
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid;
begin
  actor_id := auth.uid();

  if actor_id is null or not private.is_admin(actor_id) then
    raise exception 'Administrator access is required'
      using errcode = '42501';
  end if;

  return actor_id;
end;
$$;

revoke all on function private.assert_admin() from public;

create or replace function public.admin_rotate_invite(
  p_code_digest text,
  p_code_ciphertext text,
  p_code_hint text
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid;
  cohort_id uuid;
  previous_invite public.invite_codes%rowtype;
  new_invite public.invite_codes%rowtype;
begin
  actor_id := private.assert_admin();

  if coalesce(length(btrim(p_code_digest)), 0) = 0
    or coalesce(length(btrim(p_code_ciphertext)), 0) = 0
    or coalesce(length(btrim(p_code_hint)), 0) = 0 then
    raise exception 'Invite fields are required'
      using errcode = '22023';
  end if;

  select id
    into cohort_id
  from public.cohorts
  where is_active = true
  order by created_at
  limit 1;

  if cohort_id is null then
    raise exception 'The active cohort is not configured'
      using errcode = 'P0002';
  end if;

  select *
    into previous_invite
  from public.invite_codes
  where invite_codes.cohort_id = cohort_id
    and invite_codes.is_active = true
  for update;

  if previous_invite.id is not null then
    update public.invite_codes
    set is_active = false,
        rotated_at = now()
    where id = previous_invite.id;

    -- Existing signup/OAuth intents are bound to the prior digest. Rotation
    -- invalidates them immediately, even when they have not expired yet.
    update public.signup_intents
    set invalidated_at = coalesce(invalidated_at, now())
    where invite_digest = previous_invite.code_digest
      and consumed_at is null
      and invalidated_at is null;
  end if;

  insert into public.invite_codes (
    cohort_id,
    code_digest,
    code_ciphertext,
    code_hint,
    is_active,
    created_by
  )
  values (
    cohort_id,
    p_code_digest,
    p_code_ciphertext,
    p_code_hint,
    true,
    actor_id
  )
  returning * into new_invite;

  insert into public.audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor_id,
    'invite_rotated',
    'invite_code',
    new_invite.id,
    jsonb_build_object('previousInviteId', previous_invite.id)
  );

  return jsonb_build_object(
    'id', new_invite.id,
    'createdAt', new_invite.created_at,
    'previousInviteId', previous_invite.id
  );
end;
$$;

revoke all on function public.admin_rotate_invite(text, text, text) from public;
grant execute on function public.admin_rotate_invite(text, text, text)
  to authenticated;

create or replace function public.admin_invalidate_day(
  p_user_id uuid,
  p_local_date date,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid;
  active_cohort public.cohorts%rowtype;
  target_membership public.memberships%rowtype;
  day_override public.day_overrides%rowtype;
  normalized_reason text;
begin
  actor_id := private.assert_admin();
  normalized_reason := nullif(btrim(p_reason), '');

  if normalized_reason is not null
    and char_length(normalized_reason) > 500 then
    raise exception 'The invalidation reason is too long'
      using errcode = '22023';
  end if;

  select *
    into active_cohort
  from public.cohorts
  where is_active = true
  order by created_at
  limit 1;

  if active_cohort.id is null then
    raise exception 'The active cohort is not configured'
      using errcode = 'P0002';
  end if;

  select *
    into target_membership
  from public.memberships
  where cohort_id = active_cohort.id
    and user_id = p_user_id
    and removed_at is null;

  if target_membership.user_id is null then
    raise exception 'The member is not active'
      using errcode = 'P0002';
  end if;

  if p_local_date < active_cohort.start_date
    or p_local_date < target_membership.join_local_date then
    raise exception 'The selected date is not a scored member date'
      using errcode = '22023';
  end if;

  insert into public.day_overrides (
    user_id,
    local_date,
    kind,
    reason,
    created_by
  )
  values (
    p_user_id,
    p_local_date,
    'invalidated',
    normalized_reason,
    actor_id
  )
  on conflict (user_id, local_date)
  do update set
    reason = excluded.reason
  returning * into day_override;

  insert into public.audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor_id,
    'day_invalidated',
    'member_day',
    p_user_id,
    jsonb_build_object(
      'localDate', p_local_date,
      'reason', normalized_reason
    )
  );

  return jsonb_build_object(
    'userId', day_override.user_id,
    'localDate', day_override.local_date,
    'kind', day_override.kind,
    'reason', day_override.reason,
    'createdBy', day_override.created_by,
    'createdAt', day_override.created_at
  );
end;
$$;

revoke all on function public.admin_invalidate_day(uuid, date, text) from public;
grant execute on function public.admin_invalidate_day(uuid, date, text)
  to authenticated;

create or replace function public.admin_remove_member(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid;
  cohort_id uuid;
  target_membership public.memberships%rowtype;
begin
  actor_id := private.assert_admin();

  if p_user_id = actor_id then
    raise exception 'An administrator cannot remove their own membership'
      using errcode = '42501';
  end if;

  select id
    into cohort_id
  from public.cohorts
  where is_active = true
  order by created_at
  limit 1;

  if cohort_id is null then
    raise exception 'The active cohort is not configured'
      using errcode = 'P0002';
  end if;

  select *
    into target_membership
  from public.memberships
  where memberships.cohort_id = cohort_id
    and memberships.user_id = p_user_id
    and memberships.removed_at is null
  for update;

  if target_membership.user_id is null then
    raise exception 'The member is not active'
      using errcode = 'P0002';
  end if;

  if target_membership.role = 'admin' then
    raise exception 'An administrator membership cannot be removed here'
      using errcode = '42501';
  end if;

  update public.memberships
  set removed_at = now(),
      removed_by = actor_id
  where memberships.cohort_id = cohort_id
    and memberships.user_id = p_user_id
  returning * into target_membership;

  insert into public.audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor_id,
    'member_removed',
    'membership',
    p_user_id,
    jsonb_build_object('cohortId', cohort_id)
  );

  return jsonb_build_object(
    'userId', target_membership.user_id,
    'removedAt', target_membership.removed_at,
    'removedBy', target_membership.removed_by
  );
end;
$$;

revoke all on function public.admin_remove_member(uuid) from public;
grant execute on function public.admin_remove_member(uuid) to authenticated;

-- These two functions are the moderation boundary consumed by W7. Feed
-- internals remain owned by W3; the hooks only perform the documented
-- soft-delete fields and append an audit record. Storage cleanup is completed
-- by the server service after the post hook succeeds.
create or replace function public.admin_delete_post(
  p_post_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid;
  target_post public.posts%rowtype;
begin
  actor_id := private.assert_admin();

  select *
    into target_post
  from public.posts
  where id = p_post_id
  for update;

  if target_post.id is null then
    raise exception 'The post was not found'
      using errcode = 'P0002';
  end if;

  if target_post.status = 'deleted' then
    return jsonb_build_object(
      'id', target_post.id,
      'deleted', false,
      'authorId', target_post.author_id,
      'localDate', target_post.local_date,
      'photoPath', null
    );
  end if;

  update public.posts
  set status = 'deleted',
      deleted_at = coalesce(deleted_at, now()),
      deleted_by = actor_id
  where id = p_post_id;

  insert into public.audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor_id,
    'post_deleted_by_admin',
    'post',
    target_post.id,
    jsonb_build_object(
      'authorId', target_post.author_id,
      'localDate', target_post.local_date
    )
  );

  return jsonb_build_object(
    'id', target_post.id,
    'deleted', true,
    'authorId', target_post.author_id,
    'localDate', target_post.local_date,
    'photoPath', target_post.photo_path
  );
end;
$$;

revoke all on function public.admin_delete_post(uuid) from public;
grant execute on function public.admin_delete_post(uuid) to authenticated;

create or replace function public.admin_delete_comment(
  p_comment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  actor_id uuid;
  target_comment public.comments%rowtype;
begin
  actor_id := private.assert_admin();

  select *
    into target_comment
  from public.comments
  where id = p_comment_id
  for update;

  if target_comment.id is null then
    raise exception 'The comment was not found'
      using errcode = 'P0002';
  end if;

  if target_comment.deleted_at is not null then
    return jsonb_build_object(
      'id', target_comment.id,
      'deleted', false
    );
  end if;

  update public.comments
  set deleted_at = coalesce(deleted_at, now()),
      deleted_by = actor_id
  where id = p_comment_id;

  insert into public.audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    actor_id,
    'comment_deleted_by_admin',
    'comment',
    target_comment.id,
    '{}'::jsonb
  );

  return jsonb_build_object(
    'id', target_comment.id,
    'deleted', true
  );
end;
$$;

revoke all on function public.admin_delete_comment(uuid) from public;
grant execute on function public.admin_delete_comment(uuid) to authenticated;

grant select on public.audit_log to authenticated;

commit;
