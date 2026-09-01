-- 75 Soft mandatory daily photo update. Photo becomes required on every
-- post; required-goal data attached to a post becomes a frozen, display-only
-- snapshot of that date's rollup at publish time instead of an independent
-- additive log (post_goal_entries.required_goal_key stops receiving new
-- rows going forward -- existing rows/column are left alone). See
-- 75-soft-spec/TEAMS_PERCENTAGE_AND_DAILY_PHOTO.md §4.4.
--
-- The table has no rows yet, so this is a plain column change with no
-- backfill step.

begin;

alter table public.posts
  alter column photo_path set not null;

alter table public.posts
  drop constraint if exists posts_photo_path_check,
  drop constraint if exists posts_photo_owner_path_check;

alter table public.posts
  add constraint posts_photo_path_check check (
    photo_path ~ '^posts/[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]+\.(jpeg|png|webp)$'
  ),
  add constraint posts_photo_owner_path_check check (
    photo_path like 'posts/' || author_id::text || '/' || id::text || '/%'
  );

alter table public.posts
  add column if not exists required_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists team_id uuid null references public.teams (id)
    on delete set null;

alter table public.posts
  add constraint posts_required_snapshot_check check (
    jsonb_typeof(required_snapshot) = 'object'
  );

commit;
