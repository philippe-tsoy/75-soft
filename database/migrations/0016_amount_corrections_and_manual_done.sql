-- Allows a member to correct an over-logged amount (signed ledger entries,
-- floor-clamped at zero) and to mark workout/water/reading done independently
-- of the amount, mirroring diet's existing boolean-toggle mechanic.
-- Function bodies live in database/functions and are re-applied separately
-- (see day_helpers.sql, day_mutations.sql, day_rollup.sql, day_board.sql,
-- achievement_evaluator.sql) since this migration only owns the schema shape.

begin;

alter table public.day_deltas
  add column if not exists manual_done boolean null;

alter table public.day_deltas
  drop constraint if exists day_deltas_shape_check;

alter table public.day_deltas
  add constraint day_deltas_shape_check check (
    (
      goal_key in ('workout', 'water', 'reading')
      and amount_int is not null
      and amount_int <> 0
      and diet_value is null
      and manual_done is null
    )
    or (
      goal_key in ('workout', 'water', 'reading')
      and amount_int is null
      and diet_value is null
      and manual_done is not null
    )
    or (
      goal_key = 'diet'
      and amount_int is null
      and diet_value is not null
      and manual_done is null
    )
  );

commit;
