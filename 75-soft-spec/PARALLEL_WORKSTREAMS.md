# 75 Soft — Parallel Agent Implementation Plan

**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Common contract:** [COMMON_IMPLEMENTATION.md](./COMMON_IMPLEMENTATION.md)  
**Phase acceptance:** [PHASES_AND_ACCEPTANCE.md](./PHASES_AND_ACCEPTANCE.md)

This plan is designed for an unattended implementation run. One coordinator creates the common foundation first, then launches independent workstreams in isolated branches/worktrees. Workstreams use the common contracts and do not edit one another's files.

## 1. Execution model

```text
Coordinator
    │
    ├─ W0 Common foundation (must finish first)
    │       │
    │       ├─ W1 Auth/access/profile
    │       ├─ W2 Day tracking/containers/rollups
    │       ├─ W3 Posts/feed/social/media
    │       ├─ W4 Board/Person/calendar reads
    │       ├─ W5 Optional goals
    │       ├─ W6 Achievements
    │       ├─ W7 Admin/moderation
    │       └─ W8 Contract and RLS tests
    │
    └─ Integration gate → focused fix agents → release verification
```

The phase numbers describe product slices. They are not a serial implementation queue. After W0, W1–W8 may run in parallel wherever the dependency table permits.

## 2. Coordinator responsibilities

The coordinator is the only agent allowed to:

- create the common foundation branch;
- declare the common-first gate complete;
- change shared contracts;
- resolve cross-workstream conflicts;
- merge workstream branches;
- run the full build and integration suite;
- start a focused fix agent for a failing check;
- decide whether a failure is safe to retry or requires human input.

The coordinator must not allow agents to “solve” a conflict by silently changing `MASTER_SPEC.md`.

## 3. Dependency and parallelization matrix

| Workstream | Starts after | Can run in parallel with | Integration dependency |
|------------|--------------|--------------------------|------------------------|
| W0 Common | none | none | Blocks all others |
| W1 Auth/access | W0 | W2–W8 | Session/membership needed for browser integration |
| W2 Day tracking | W0 | W1, W3–W8 | Owns canonical rollup implementation |
| W3 Posts/feed/social | W0 | W1, W2, W4–W8 | Uses scoring interface; full scoring effects verified after W2 |
| W4 Board/Person/calendar | W0 | W1, W2, W3, W5–W8 | Uses scoring interface; final reads verified after W2 |
| W5 Optional goals | W0 | W1–W4, W6–W8 | Post display integrated after W3 |
| W6 Achievements | W0 | W1–W5, W7–W8 | Evaluator integrated after W2/W3 |
| W7 Admin/moderation | W0 | W1–W6, W8 | Admin mutations integrated after relevant domain tables exist |
| W8 Contract/RLS tests | W0 | W1–W7 | Full suite runs again at integration gate |
| W9 Integration hardening | W1–W8 branches available | none | Release gate |

Agents may use typed stubs or fixtures for a dependency that is not merged yet. They must not copy a second implementation of that dependency.

## 4. Agent prompt template

The coordinator can launch each workstream with this prompt shape:

```text
You are workstream W# for 75 Soft.

Read COMMON_IMPLEMENTATION.md first, then the workstream's listed documents.
Work only in your isolated branch/worktree and only in the paths listed under Own.
Implement the listed behavior against the frozen shared contracts.
Do not edit MASTER_SPEC.md, common-owned files, or another workstream's paths.
If a shared contract is insufficient, stop and report a contract request; do not
create a duplicate helper or silently change product behavior.
Use fixtures/stubs for unmerged dependencies.
Run the owning tests, lint, typecheck, and build checks available in your branch.
Do not commit secrets or environment files.
Return the required machine-readable completion report from §6.
```

The coordinator substitutes the workstream's brief, ownership list, checks, and dependencies into `W#`.

## 5. Workstream ownership

The paths below are exclusive. A path not listed is coordinator-owned until assigned explicitly.

### W0 — Common foundation

**Brief:** Build the reusable implementation contract before domain work begins.

**Read:**

- `COMMON_IMPLEMENTATION.md`
- `ARCHITECTURE.md`
- `DATA_MODEL.md`
- `API_CONTRACTS.md`

**Own:**

```text
lib/config/
lib/types/
lib/dates/
lib/http/
lib/supabase/
lib/storage/
lib/validation/
components/ui/
components/app-shell/
components/feedback/
components/sheets/
components/lightbox/
tests/fixtures/75-soft/
database/migrations/0001_core.sql
package.json
tsconfig.json
proxy.ts
```

**Implement:**

- project/tooling baseline;
- client/server/admin Supabase boundaries;
- session and active-member/admin guards;
- canonical types, constants, date utilities, response helpers, image validation, and query-key helpers;
- core cohort/profile/membership/invite/audit schema and RLS helpers;
- common UI primitives;
- common scoring interface with fixtures or a minimal contract stub;
- build/lint/typecheck/test commands.

**Do not touch:** domain feature folders, domain migrations, master product rules.

**Done when:**

- clean install/build/lint/typecheck pass;
- common date, validation, HTTP, and RLS tests pass;
- service-role import is server-only;
- all exports are documented;
- the coordinator records the branch/commit used as the common baseline.

### W1 — Auth, invite, access, and profile

**Brief:** Implement invite-gated signup, login, account linking, membership completion, and profile editing.

**Read:**

- `AUTH_AND_ACCESS.md`
- `API_CONTRACTS.md` auth/profile sections
- `COMMON_IMPLEMENTATION.md`
- Phase 2 in `PHASES_AND_ACCEPTANCE.md`

**Own:**

```text
features/auth/
features/profiles/
app/(auth)/
app/auth/callback/
app/api/auth/
app/api/invite/
app/api/profile/route.ts
```

**Implement:**

- Invite validation and signed/short-lived signup intent;
- email/password signup and confirmation;
- login/logout/password reset;
- active-member redirects and removed-member denial;
- profile name, photo, and timezone completion/editing;
- auth/profile API contract tests.

**Do not touch:** common session clients, common types, day/feed/board UI, shared schema files.

**Done when:**

- invalid invite cannot complete signup;
- reusable invite supports multiple members until rotation;
- existing members log in without an invite;
- non-members cannot read group data;
- same verified email does not create duplicate app profiles;
- auth browser journeys pass with test providers/mocks.

### W2 — Day tracking, containers, and rollups

**Brief:** Implement the four required challenge controls, local-day edit rules, additive events, diet state, and canonical rollup service.

**Read:**

- `SCORING_AND_ROLLUPS.md`
- `DATA_MODEL.md`
- `API_CONTRACTS.md` day/container sections
- `COMMON_IMPLEMENTATION.md`
- Phases 3 and 5–6 in `PHASES_AND_ACCEPTANCE.md`

**Own:**

```text
features/day-tracking/
components/day/
app/(app)/today/_tracker/ # own-day controls only
app/api/day/
app/api/containers/
database/migrations/0002_day_tracking.sql
database/functions/day_*.sql
tests/scoring/
```

**Implement:**

- workout, water, reading, and diet controls;
- canonical amount conversion and operation-id idempotency;
- container CRUD and tap-to-add;
- today/yesterday date authorization;
- diet event behavior behind the scoring interface;
- day rollup and daily Board score;
- calendar cells for historical display;
- optimistic amount mutation and rollback;
- golden scoring tests.

**Do not touch:** group strip/Board ranking UI, feed/post code, optional-goal tables, admin routes, common scoring types.

**Done when:**

- chips/container taps add exactly once;
- diet toggle is race-safe;
- quiet actions create no feed row;
- current-local-day Board score is correct and resets at local midnight;
- post entries can be consumed through the shared scoring interface;
- timezone, late-join, invalidation, and deletion fixtures pass.

### W3 — Post update, feed, media, reactions, and comments

**Brief:** Implement submitted updates as the only feed source, with additive goal entries and private photos.

**Read:**

- `API_CONTRACTS.md` post/feed/social sections
- `DATA_MODEL.md` post/reaction/comment sections
- `UI_AND_NAVIGATION.md` post/feed sections
- `COMMON_IMPLEMENTATION.md`

**Own:**

```text
features/feed/
components/feed/
app/(app)/feed/
app/api/posts/
app/api/feed/
app/api/comments/
app/api/reactions/
app/api/profile/reactions/
database/migrations/0003_social.sql
```

**Implement:**

- post compose sheet and required/optional goal entries;
- pending → upload → published lifecycle;
- 5 MB jpeg/png/webp validation and private signed photo URLs;
- feed cursor pagination and author/photo navigation;
- one reaction per user/post and custom palette;
- 256-character immutable comments;
- author/admin deletion hooks and rollup recalculation;
- social API/route tests.

**Do not touch:** day-tracking implementation, Board/Person routes, common Storage helper, admin migration.

**Done when:**

- optional-only post appears but does not score;
- several posts add amounts;
- quiet logs never appear in Feed;
- duplicate post retry is idempotent;
- photo failure cannot publish a partial post;
- deleting a post removes its scoring entries and cleans up media.

### W4 — Board, Person, and calendar reads

**Brief:** Implement group visibility and profile-read surfaces using the common scoring service.

**Read:**

- `UI_AND_NAVIGATION.md`
- `SCORING_AND_ROLLUPS.md`
- `API_CONTRACTS.md`
- `COMMON_IMPLEMENTATION.md`

**Own:**

```text
features/board/
features/person/
components/board/
components/person/
components/group-strip/
app/(app)/board/
app/(app)/person/
app/(app)/today/_group-strip/
app/api/board/
app/api/profiles/[userId]/
database/migrations/0004_read_models.sql
```

**Implement:**

- group strip with four dots and current-local-day count;
- Board list with competition ranking and score date;
- Person calendar, current-day details, achievements slot, and posts slot;
- member-scoped aggregate read RPCs;
- responsive loading/empty/error states.

**Do not touch:** Today goal controls, Feed components, optional-goal data, common DTO definitions.

**Done when:**

- active members see permitted group aggregates only;
- each Board row uses that member's local date;
- score resets at member local midnight;
- ties render `1, 1, 3`;
- no optional or prior-day total affects Board;
- pre-join calendar cells remain unscored.

### W5 — Optional personal goals

**Brief:** Implement private optional goals and owner-only logs/toasts without affecting required scoring.

**Read:**

- `MASTER_SPEC.md` optional-goal section
- `DATA_MODEL.md`
- `API_CONTRACTS.md`
- `UI_AND_NAVIGATION.md`
- `COMMON_IMPLEMENTATION.md`

**Own:**

```text
features/optional-goals/
components/optional-goals/
app/api/optional-goals/
database/migrations/0005_optional_goals.sql
```

**Implement:**

- add/edit/archive optional goals;
- checkbox and numeric target types;
- today/yesterday owner-only logs;
- optional-only post payload adapter;
- owner-only optional streak toast hook;
- privacy and non-interference tests.

**Do not touch:** required goal rollup SQL, Board ranking, common types, Feed rendering internals.

**Done when:**

- optional data is private;
- optional-only posts render selected optional data;
- optional logs never affect required dots, daily Board, or day state;
- archived goals cannot receive new active logs.

### W6 — Achievements

**Brief:** Implement fixed and initial hidden achievements as an idempotent evaluator.

**Read:**

- `MASTER_SPEC.md` achievements section
- `SCORING_AND_ROLLUPS.md`
- `DATA_MODEL.md`
- `COMMON_IMPLEMENTATION.md`

**Own:**

```text
features/achievements/
components/achievements/
app/api/achievements/
database/migrations/0006_achievements.sql
database/functions/achievement_*.sql
```

**Implement:**

- fixed catalog excluding removed weekly achievements;
- initial hidden catalog from the scoring subspec;
- idempotent unlock evaluation after relevant events;
- one display toast per action;
- locked `???` rendering;
- lazy Day 75 evaluation.

**Do not touch:** scoring formulas, post/day mutation boundaries, common toast primitives, admin moderation rules.

**Done when:**

- quiet taps do not unlock `FIRST_UPDATE`;
- first four-challenge day, first photo, first post, and Day 75 unlock correctly;
- hidden achievements remain `???` until unlocked;
- repeated evaluation creates no duplicate unlock;
- optional streaks remain owner-only and non-ranked.

### W7 — Admin and moderation

**Brief:** Implement invite rotation, member removal, day invalidation, post moderation, and audit views.

**Read:**

- `AUTH_AND_ACCESS.md`
- `DATA_MODEL.md`
- `API_CONTRACTS.md` admin sections
- `UI_AND_NAVIGATION.md`
- `COMMON_IMPLEMENTATION.md`

**Own:**

```text
features/admin/
components/admin/
app/(app)/admin/
app/api/admin/
database/migrations/0007_admin.sql
```

**Implement:**

- admin-only route and server role guard;
- current invite display/copy and rotation;
- active member list;
- invalidate member date, forcing four challenges not met;
- remove member;
- invoke the approved moderation mutation/RPC for abusive post/comment deletion without importing feed internals;
- audit rows and admin confirmation UI.

**Do not touch:** common auth guard implementation, domain post deletion internals, member-owned day mutation code.

**Done when:**

- ordinary members cannot call admin routes;
- invite rotation invalidates old signup completion;
- invalidated date keeps posts visible and daily Board score at 0;
- admin cannot enter another member's amounts;
- removal blocks group access;
- every admin mutation is audited.

### W8 — Contract, RLS, and regression tests

**Brief:** Build tests in parallel with feature work and keep the contract boundaries honest.

**Read:**

- `TESTING_AND_OPERATIONS.md`
- `COMMON_IMPLEMENTATION.md`
- all API/data/scoring subspecs

**Own:**

```text
tests/api/
tests/database/
tests/rls/
tests/e2e/
playwright.config.*
```

**Implement:**

- RLS matrix for anonymous/member/admin/removed contexts;
- API validation/error/idempotency tests;
- scoring golden fixtures and timezone matrix;
- browser smoke journeys using stable test accounts;
- accessibility checks for primary screens;
- no-leak assertions for optional goals/raw logs/private photos.

**Do not touch:** feature implementation files or shared contracts except through coordinator change requests.

**Done when:**

- tests fail when a feature leaks data, double-counts, or bypasses date rules;
- all relevant contract paths have a regression test;
- tests can run on a clean local environment;
- failures identify an owning workstream.

## 6. Workstream completion report

Every agent returns a short machine-readable report:

```text
WORKSTREAM: W#
STATUS: complete | blocked | needs-integration
BRANCH:
COMMIT:
FILES:
CHECKS:
DEPENDENCIES:
CONTRACT_REQUESTS:
KNOWN_ISSUES:
```

An agent must report `blocked` rather than editing outside ownership. The coordinator may resume the same agent after resolving a contract request.

## 7. Shared contract change process

If a workstream needs a common change:

1. Stop changing the shared file locally.
2. Open a contract request with current/proposed interface and affected tests.
3. Coordinator evaluates whether the request matches the master spec.
4. Coordinator updates the common contract and fixture.
5. All affected agents rebase or refresh from the new common baseline.

No agent may duplicate a helper “temporarily” in its feature folder.

## 8. Branch and merge rules

Use one isolated branch/worktree per workstream:

```text
agent/common
agent/auth
agent/day
agent/social
agent/board-person
agent/optional
agent/achievements
agent/admin
agent/tests
```

Rules:

- one focused commit per coherent work unit;
- no force pushes or destructive resets;
- no secrets or local environment files in commits;
- rebase/refresh from common before requesting merge;
- run the owning workstream checks before merge;
- migrations keep unique numeric ordering;
- coordinator merges common first, then any domain order, then tests, then integration fixes.

## 9. Integration gates

### Gate A — Common

- W0 report is complete.
- Clean build/lint/typecheck/common tests pass.
- Common branch is frozen.

### Gate B — Domain merge

- W1–W8 reports are available.
- Each branch passes its owning checks.
- No unapproved contract requests remain.
- Migrations apply in order on a fresh local database.

### Gate C — Full integration

- Auth → Today → Feed → Board → Person → Me → Admin browser journey passes.
- RLS matrix passes.
- Scoring fixtures pass after all post/admin effects are connected.
- No duplicate app shell, toast, sheet, or error implementation exists.

### Gate D — Release

- `TESTING_AND_OPERATIONS.md` release checklist is complete.
- Remaining product choices are either confirmed or explicitly recorded as provisional defaults.
- Coordinator creates a final handoff report with branch, migration, test, and deployment state.

## 10. Unresolved decisions during unattended execution

The current review still has two product questions:

- diet event precedence when quiet toggles and posts affect one date;
- whether an admin can restore an invalidated date.

They must not cause parallel agents to invent competing behavior. Until confirmed, use the provisional behavior already isolated in `SCORING_AND_ROLLUPS.md`:

- latest active diet event wins; deleting a post reveals the previous event;
- invalidation has no restore endpoint.

Record both as provisional in the integration handoff and keep them behind the scoring/admin service interfaces so they can be changed without rewriting UI or schema consumers.

## 11. Autonomous coordinator loop

```text
read COMMON_IMPLEMENTATION.md
run W0
if common gate fails:
  start one focused W0 fix
  rerun common gate
else:
  launch all ready W1–W8 workstreams in isolated worktrees
  collect each completion report
  run owning checks
  merge successful streams
  run migration + build + RLS + browser integration
  for each failure:
    assign one focused fix to the owning workstream
    rerun the smallest failing check
  run full release checklist
  stop with a handoff report
```

The coordinator should not keep retrying the same failure without new evidence. A migration conflict, security leak, or product-rule contradiction is a handoff blocker rather than a reason to modify unrelated work.

