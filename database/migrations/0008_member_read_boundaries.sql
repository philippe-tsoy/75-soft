-- Forward-only member-scoped read boundaries for W4 aggregate and Person views.
-- Reapply the canonical W2/W6 functions so existing deployments receive the
-- trusted helpers as well as fresh installs.

begin;

\ir ../functions/day_rollup.sql
\ir ../functions/day_board.sql
\ir ../functions/achievement_reads.sql
\ir ../functions/read_model_member_updates.sql

commit;
