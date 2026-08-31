-- 75 Soft achievements.
-- The catalog is shared by every member. Unlock rows are append-only so
-- moderation cannot silently revoke an achievement already displayed.

begin;

create table if not exists public.achievements (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text not null,
  is_hidden boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  constraint achievements_code_check check (
    code ~ '^[A-Z][A-Z0-9_]*$'
  ),
  constraint achievements_sort_order_check check (sort_order > 0)
);

create unique index if not exists achievements_sort_order_idx
  on public.achievements (sort_order);

create table if not exists public.user_achievements (
  user_id uuid not null references public.profiles (id) on delete cascade,
  achievement_id uuid not null references public.achievements (id) on delete restrict,
  unlocked_at timestamptz not null default now(),
  evidence jsonb not null default '{}'::jsonb,
  primary key (user_id, achievement_id)
);

create index if not exists user_achievements_user_unlocked_idx
  on public.user_achievements (user_id, unlocked_at, achievement_id);

insert into public.achievements (
  code,
  title,
  description,
  is_hidden,
  sort_order
)
values
  (
    'FIRST_UPDATE',
    'First Update',
    'Publish your first Post update.',
    false,
    10
  ),
  (
    'FIRST_FULL_DAY',
    'Full Day',
    'Meet all four required goals in one day.',
    false,
    20
  ),
  (
    'FIRST_PHOTO',
    'First Photo',
    'Publish your first photo update.',
    false,
    30
  ),
  (
    'DAY_75',
    'Day 75',
    'Reach Day 75 of the shared calendar.',
    false,
    40
  ),
  (
    'THREE_POSTS_ONE_DAY',
    'Triple Update',
    'Publish three updates on one local date.',
    true,
    50
  ),
  (
    'WATER_BEFORE_NOON',
    'Early Hydration',
    'Reach 2,000 ml before noon in your timezone.',
    true,
    60
  ),
  (
    'FULL_DAY_AFTER_MISS',
    'Comeback Day',
    'Complete a local day immediately after a closed no-goal day.',
    true,
    70
  ),
  (
    'WORKOUT_READING_ONE_POST',
    'Double Duty',
    'Include workout and reading in one Post update.',
    true,
    80
  ),
  (
    'SEVEN_PHOTOS',
    'Seven Photos',
    'Publish seven photo updates.',
    true,
    90
  ),
  (
    'WATER_EXACT_TARGET',
    'Exact Pour',
    'Reach exactly 2,000 ml in a daily water rollup.',
    true,
    100
  )
on conflict (code) do update
set
  title = excluded.title,
  description = excluded.description,
  is_hidden = excluded.is_hidden,
  sort_order = excluded.sort_order;

alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;

drop policy if exists achievements_member_select on public.achievements;
create policy achievements_member_select
on public.achievements
for select
to authenticated
using (private.is_active_member(auth.uid()));

drop policy if exists user_achievements_member_select
  on public.user_achievements;
create policy user_achievements_member_select
on public.user_achievements
for select
to authenticated
using (
  private.is_active_member(auth.uid())
  and (
    user_id = auth.uid()
    or private.is_admin(auth.uid())
  )
);

revoke all on public.achievements from anon;
revoke all on public.user_achievements from anon;
grant select on public.achievements to authenticated;
grant select on public.user_achievements to authenticated;

\ir ../functions/achievement_evaluator.sql
\ir ../functions/achievement_reads.sql

commit;
