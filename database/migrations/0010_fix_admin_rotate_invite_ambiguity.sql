-- Qualify invite rotation references so PL/pgSQL variables cannot collide with
-- table columns.

begin;

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
  v_actor_id uuid;
  v_cohort_id uuid;
  v_previous_invite public.invite_codes%rowtype;
  v_new_invite public.invite_codes%rowtype;
begin
  v_actor_id := private.assert_admin();

  if coalesce(length(btrim(p_code_digest)), 0) = 0
    or coalesce(length(btrim(p_code_ciphertext)), 0) = 0
    or coalesce(length(btrim(p_code_hint)), 0) = 0 then
    raise exception 'Invite fields are required'
      using errcode = '22023';
  end if;

  select cohort.id
    into v_cohort_id
  from public.cohorts as cohort
  where cohort.is_active = true
  order by cohort.created_at
  limit 1;

  if v_cohort_id is null then
    raise exception 'The active cohort is not configured'
      using errcode = 'P0002';
  end if;

  select invite.*
    into v_previous_invite
  from public.invite_codes as invite
  where invite.cohort_id = v_cohort_id
    and invite.is_active = true
  for update;

  if v_previous_invite.id is not null then
    update public.invite_codes as invite
    set is_active = false,
        rotated_at = now()
    where invite.id = v_previous_invite.id;

    update public.signup_intents as intent
    set invalidated_at = coalesce(intent.invalidated_at, now())
    where intent.invite_digest = v_previous_invite.code_digest
      and intent.consumed_at is null
      and intent.invalidated_at is null;
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
    v_cohort_id,
    p_code_digest,
    p_code_ciphertext,
    p_code_hint,
    true,
    v_actor_id
  )
  returning * into v_new_invite;

  insert into public.audit_log (
    actor_id,
    action,
    target_type,
    target_id,
    metadata
  )
  values (
    v_actor_id,
    'invite_rotated',
    'invite_code',
    v_new_invite.id,
    jsonb_build_object('previousInviteId', v_previous_invite.id)
  );

  return jsonb_build_object(
    'id', v_new_invite.id,
    'createdAt', v_new_invite.created_at,
    'previousInviteId', v_previous_invite.id
  );
end;
$$;

revoke all on function public.admin_rotate_invite(text, text, text) from public;
grant execute on function public.admin_rotate_invite(text, text, text)
  to authenticated;

commit;
