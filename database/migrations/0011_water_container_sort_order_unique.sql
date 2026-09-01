-- Prevent two concurrently created containers from landing on the same
-- sort_order for one owner (app-layer create computes max()+1 non-atomically).

begin;

create unique index if not exists water_containers_owner_sort_order_unique
  on public.water_containers (owner_id, sort_order)
  where deleted_at is null;

commit;
