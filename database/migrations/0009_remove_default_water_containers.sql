-- Remove seeded water containers. Members manage their own containers.

begin;

drop trigger if exists memberships_seed_day_containers
  on public.memberships;

drop function if exists private.day_seed_default_containers();

delete from public.water_containers
where (label, volume_ml, sort_order) in (
  ('Glass', 250, 0),
  ('Bottle', 500, 1)
);

commit;
