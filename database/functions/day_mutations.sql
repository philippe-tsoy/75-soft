create or replace function public.day_add_amount(
  p_local_date date,
  p_goal_id uuid,
  p_amount_int integer,
  p_client_operation_id text
)
returns table (
  delta_id uuid,
  idempotent boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_existing_date date;
  v_inserted_id uuid;
  v_current_sum bigint;
  v_effective_amount integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_client_operation_id is null
     or p_client_operation_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_OPERATION';
  end if;

  select delta.id, delta.local_date
  into v_existing_id, v_existing_date
  from public.day_deltas as delta
  where delta.user_id = v_user_id
    and delta.client_operation_id = p_client_operation_id;

  if found then
    if v_existing_date <> p_local_date then
      raise exception 'OPERATION_DATE_CONFLICT';
    end if;

    return query select v_existing_id, true;
    return;
  end if;

  if p_goal_id is null
     or p_amount_int is null
     or p_amount_int = 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  perform private.day_assert_active_actor(v_user_id, p_local_date);

  v_effective_amount := p_amount_int;

  if p_amount_int < 0 then
    /*
     * Corrections (negative taps) are inserted as their own signed ledger
     * rows rather than mutating a prior entry, keeping the audit trail
     * append-only. The advisory lock serializes the read-then-clamp so two
     * concurrent corrections cannot both observe the same prior sum and
     * together push the total below zero.
     */
    perform pg_advisory_xact_lock(
      hashtextextended(
        v_user_id::text || ':' || p_local_date::text || ':' || p_goal_id::text,
        1
      )
    );

    select coalesce(sum(delta.amount_int), 0)
    into v_current_sum
    from public.day_deltas as delta
    where delta.user_id = v_user_id
      and delta.local_date = p_local_date
      and delta.goal_id = p_goal_id
      and delta.amount_int is not null;

    v_effective_amount := greatest(p_amount_int, -v_current_sum);

    if v_effective_amount = 0 then
      raise exception 'AMOUNT_ALREADY_ZERO';
    end if;
  end if;

  insert into public.day_deltas (
    user_id,
    local_date,
    goal_id,
    amount_int,
    source,
    client_operation_id
  )
  values (
    v_user_id,
    p_local_date,
    p_goal_id,
    v_effective_amount,
    'quiet',
    p_client_operation_id
  )
  on conflict (user_id, client_operation_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select delta.id
    into v_inserted_id
    from public.day_deltas as delta
    where delta.user_id = v_user_id
      and delta.client_operation_id = p_client_operation_id;

    return query select v_inserted_id, true;
  else
    return query select v_inserted_id, false;
  end if;
end;
$$;

create or replace function public.day_toggle_goal_done(
  p_local_date date,
  p_goal_id uuid,
  p_client_operation_id text
)
returns table (
  delta_id uuid,
  idempotent boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_existing_date date;
  v_inserted_id uuid;
  v_current_state boolean;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_goal_id is null then
    raise exception 'INVALID_GOAL';
  end if;

  if p_client_operation_id is null
     or p_client_operation_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_OPERATION';
  end if;

  select delta.id, delta.local_date
  into v_existing_id, v_existing_date
  from public.day_deltas as delta
  where delta.user_id = v_user_id
    and delta.client_operation_id = p_client_operation_id;

  if found then
    if v_existing_date <> p_local_date then
      raise exception 'OPERATION_DATE_CONFLICT';
    end if;

    return query select v_existing_id, true;
    return;
  end if;

  perform private.day_assert_active_actor(v_user_id, p_local_date);

  /*
   * Advisory lock serializes the derived-state read and the inverse append
   * for one member/date/goal, the same shape every quiet toggle in this
   * ledger uses.
   */
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_user_id::text || ':' || p_local_date::text || ':' || p_goal_id::text,
      2
    )
  );

  select delta.id, delta.local_date
  into v_existing_id, v_existing_date
  from public.day_deltas as delta
  where delta.user_id = v_user_id
    and delta.client_operation_id = p_client_operation_id;

  if found then
    if v_existing_date <> p_local_date then
      raise exception 'OPERATION_DATE_CONFLICT';
    end if;

    return query select v_existing_id, true;
    return;
  end if;

  v_current_state := private.day_latest_manual_done(
    v_user_id,
    p_local_date,
    p_goal_id,
    now()
  );

  insert into public.day_deltas (
    user_id,
    local_date,
    goal_id,
    manual_done,
    source,
    client_operation_id
  )
  values (
    v_user_id,
    p_local_date,
    p_goal_id,
    not v_current_state,
    'quiet',
    p_client_operation_id
  )
  returning id into v_inserted_id;

  return query select v_inserted_id, false;
end;
$$;

create or replace function public.day_add_container_tap(
  p_local_date date,
  p_container_id uuid,
  p_goal_id uuid,
  p_client_operation_id text
)
returns table (
  delta_id uuid,
  idempotent boolean
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing_id uuid;
  v_existing_date date;
  v_inserted_id uuid;
  v_volume_ml integer;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_goal_id is null then
    raise exception 'INVALID_AMOUNT';
  end if;

  if p_client_operation_id is null
     or p_client_operation_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    raise exception 'INVALID_OPERATION';
  end if;

  select delta.id, delta.local_date
  into v_existing_id, v_existing_date
  from public.day_deltas as delta
  where delta.user_id = v_user_id
    and delta.client_operation_id = p_client_operation_id;

  if found then
    if v_existing_date <> p_local_date then
      raise exception 'OPERATION_DATE_CONFLICT';
    end if;

    return query select v_existing_id, true;
    return;
  end if;

  perform private.day_assert_active_actor(v_user_id, p_local_date);

  select container.volume_ml
  into v_volume_ml
  from public.water_containers as container
  where container.id = p_container_id
    and container.owner_id = v_user_id
    and container.deleted_at is null
  for update;

  if not found then
    raise exception 'CONTAINER_NOT_FOUND';
  end if;

  insert into public.day_deltas (
    user_id,
    local_date,
    goal_id,
    amount_int,
    source,
    client_operation_id
  )
  values (
    v_user_id,
    p_local_date,
    p_goal_id,
    v_volume_ml,
    'quiet',
    p_client_operation_id
  )
  on conflict (user_id, client_operation_id) do nothing
  returning id into v_inserted_id;

  if v_inserted_id is null then
    select delta.id
    into v_inserted_id
    from public.day_deltas as delta
    where delta.user_id = v_user_id
      and delta.client_operation_id = p_client_operation_id;

    return query select v_inserted_id, true;
  else
    return query select v_inserted_id, false;
  end if;
end;
$$;

revoke all on function public.day_add_amount(date, uuid, integer, text)
  from public;
revoke all on function public.day_add_container_tap(date, uuid, uuid, text)
  from public;
revoke all on function public.day_toggle_goal_done(date, uuid, text)
  from public;
grant execute on function public.day_add_amount(date, uuid, integer, text)
  to authenticated;
grant execute on function public.day_add_container_tap(date, uuid, uuid, text)
  to authenticated;
grant execute on function public.day_toggle_goal_done(date, uuid, text)
  to authenticated;
