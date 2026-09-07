-- Members choose how they log workout/water/reading amounts: a drag slider
-- that runs 0 -> target, or the older - / + button steppers. The preference
-- lives on the profile so it follows the member across devices.

begin;

alter table public.profiles
  add column if not exists amount_input_mode text not null default 'slider';

alter table public.profiles
  drop constraint if exists profiles_amount_input_mode_check;

alter table public.profiles
  add constraint profiles_amount_input_mode_check
    check (amount_input_mode in ('slider', 'buttons'));

commit;
