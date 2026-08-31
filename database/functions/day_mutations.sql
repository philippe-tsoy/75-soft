create or replace function public.day_add_amount(
  p_local_date date,
  p_goal_key text,
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

  if p_goal_key not in ('workout', 'water', 'reading')
     or p_amount_int is null
     or p_amount_int <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;

  perform private.day_assert_active_actor(v_user_id, p_local_date);

  insert into public.day_deltas (
    user_id,
    local_date,
    goal_key,
    amount_int,
    source,
    client_operation_id
  )
  values (
    v_user_id,
    p_local_date,
    p_goal_key,
    p_amount_int,
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

create or replace function public.day_add_container_tap(
  p_local_date date,
  p_container_id uuid,
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
    goal_key,
    amount_int,
    source,
    client_operation_id
  )
  values (
    v_user_id,
    p_local_date,
    'water',
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

create or replace function public.day_toggle_diet(
  p_local_date date,
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
   * Advisory locks serialize the derived-state read and inverse append for
   * one member/date. Distinct concurrent taps therefore become true/false
   * events rather than both observing the same prior state.
   */
  perform pg_advisory_xact_lock(
    hashtextextended(
      v_user_id::text || ':' || p_local_date::text,
      0
    )
  );

  -- Re-check after waiting for another toggle to commit.
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

  v_current_state := private.day_latest_diet_state(
    v_user_id,
    p_local_date,
    now()
  );

  insert into public.day_deltas (
    user_id,
    local_date,
    goal_key,
    diet_value,
    source,
    client_operation_id
  )
  values (
    v_user_id,
    p_local_date,
    'diet',
    not v_current_state,
    'quiet',
    p_client_operation_id
  )
  returning id into v_inserted_id;

  return query select v_inserted_id, false;
end;
$$;

revoke all on function public.day_add_amount(date, text, integer, text)
  from public;
revoke all on function public.day_add_container_tap(date, uuid, text)
  from public;
revoke all on function public.day_toggle_diet(date, text)
  from public;
grant execute on function public.day_add_amount(date, text, integer, text)
  to authenticated;
grant execute on function public.day_add_container_tap(date, uuid, text)
  to authenticated;
grant execute on function public.day_toggle_diet(date, text)
  to authenticated;
