-- Retires the WORKOUT_READING_ONE_POST hidden achievement. Its premise
-- (choosing which required goals to attach to a post) no longer exists:
-- required-goal entries are not client-submittable as of
-- 0014_post_photo_required.sql, so the achievement could never unlock again.
-- No user has this achievement yet (no cohort data exists), so a plain
-- delete is safe; user_achievements.achievement_id is ON DELETE RESTRICT,
-- so this would fail loudly instead of silently orphaning a real unlock.

begin;

delete from public.achievements
where code = 'WORKOUT_READING_ONE_POST';

commit;
