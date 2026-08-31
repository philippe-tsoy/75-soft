# 75 Soft — Implementation Phases and Acceptance

**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Related:** [IMPLEMENTATION_INDEX.md](./IMPLEMENTATION_INDEX.md), [TESTING_AND_OPERATIONS.md](./TESTING_AND_OPERATIONS.md)

Each phase should leave the app buildable and testable. A phase is complete only when its automated tests, RLS checks, and listed manual checks pass.

## Parallel execution

These phases describe product slices, not a mandatory serial coding order. The unattended implementation order is:

```text
W0 Common implementation contract
  └─ W1 Auth · W2 Day tracking · W3 Feed/social · W4 Board/Person
     W5 Optional goals · W6 Achievements · W7 Admin · W8 Contract/RLS tests
       └─ W9 Integration hardening and release
```

After W0, the workstreams can build against the frozen shared types, validators, date utilities, scoring interface, DTOs, and fixtures. “Depends on” below means the feature must be integrated and verified against that dependency; it does not prevent an agent from implementing its isolated branch in parallel. See [COMMON_IMPLEMENTATION.md](./COMMON_IMPLEMENTATION.md) and [PARALLEL_WORKSTREAMS.md](./PARALLEL_WORKSTREAMS.md) for ownership and merge rules.

## Phase 0 — Foundation

**Depends on:** none  
**Ships:** running mobile-first app shell and tooling

Tasks:

- Create Next.js App Router + strict TypeScript project.
- Add styling/component baseline, TanStack Query, React Hook Form, Zod, Supabase clients.
- Add lint, format, typecheck, unit-test, and end-to-end-test commands.
- Add server/browser Supabase client separation and session proxy stubs.
- Add `.env.example`; never commit real keys.
- Establish folder structure from `ARCHITECTURE.md`.

Acceptance:

- `dev`, `build`, `lint`, `typecheck`, and test commands run cleanly.
- Auth routes and protected shell have placeholder states.
- Service-role code cannot be imported into client bundles.

## Phase 1 — Database, RLS, and storage

**Depends on:** Phase 0  
**Ships:** repeatable backend foundation

Tasks:

- Create migrations for tables in `DATA_MODEL.md`.
- Seed cohort, required-goal configuration, default reaction palette, containers, and achievements.
- Add helper functions, rollup read functions, mutation RPCs, and indexes.
- Enable RLS on every application table.
- Create private `post-photos` bucket and server-controlled access path.
- Document the manual first-admin and first-invite setup.

Acceptance:

- A fresh database can be migrated from empty to usable in documented order.
- Anonymous users cannot read group data.
- A member can read permitted aggregate data but not another member's raw deltas or optional goals.
- Non-admin members cannot access invite, invalidation, removal, or audit data.
- Database constraints reject invalid goal keys, negative amounts, duplicate operation ids, and invalid post entries.

## Phase 2 — Invite-gated auth and profiles

**Depends on:** Phases 0–1  
**Master slice:** reusable invite, admin, Google/email auth, name/photo

Tasks:

- Implement Invite page and reusable code validation.
- Implement email/password signup with pending confirmation support.
- Implement Google OAuth with signed invite intent and callback completion.
- Implement login, logout, forgot password, and active-membership redirect.
- Implement profile completion and profile photo upload.
- Implement secure identity linking for Google/email accounts.

Acceptance:

- Invalid invite does not create an app profile or active membership.
- Multiple users can use the same active code.
- Rotating the code blocks new signup completion with the old code.
- Email and Google signup produce one profile/membership and land on Today.
- Existing members can log in without an invite.
- Non-members see no group data.

## Phase 3 — Quiet tracker and containers

**Depends on:** Phase 2  
**Master slice:** workout/reading chips, water containers, diet

Tasks:

- Implement Today tracker for the four required goals.
- Add positive custom amount validation and canonical unit conversion.
- Add container CRUD, starter containers, and one-tap water events.
- Add diet transactional toggle.
- Add operation-id idempotency and optimistic amount feedback.
- Return fresh DayRollupDTO after every mutation.

Acceptance:

- One workout/reading chip logs exactly one amount.
- One container tap logs its saved volume.
- Repeated network retry with the same operation id does not double-count.
- Diet first tap sets and second tap unsets.
- Quiet actions create no feed item.
- Client cannot write another member's day or an older day.
- A zero-goal open today is neutral, not missed.

## Phase 4 — Post update, media, and feed

**Depends on:** Phase 3  
**Master slice:** post update, photo, feed, reactions, comments

Tasks:

- Implement Post update sheet with required/optional goal selection.
- Reuse goal amount controls and container resolution in compose.
- Implement pending/published post lifecycle and private photo upload.
- Implement feed cursor pagination, author navigation, and photo lightbox.
- Implement custom reaction palette, one reaction per user/post, and comments.
- Implement author/admin deletion and rollup recalculation.

Acceptance:

- Optional-goals-only post appears in feed but scores no required goal.
- A post with amounts changes the day rollup exactly once.
- Multiple posts per day add amounts.
- Quiet logs remain absent from feed.
- Photo types over 5 MB or outside jpeg/png/webp are rejected server-side.
- Comment over 256 characters is rejected and comments cannot be edited.
- Deleting a post removes its amounts from scoring and preserves permitted visible history/audit behavior.

## Phase 5 — Calendar and Yesterday

**Depends on:** Phase 3; post dates from Phase 4  
**Master slice:** shared calendar, yesterday edit, day rollup

Tasks:

- Implement cohort Day N and local-date utilities.
- Implement Today week/month grid.
- Implement Yesterday sheet with fixed date.
- Implement closed-day status and pre-start/pre-join blank cells.
- Add timezone-aware feed timestamps and date-boundary tests.

Acceptance:

- 2026-09-01 is Day 1 for every member.
- A late joiner's pre-join cells are unscored, not misses.
- Today and yesterday are the only editable dates.
- At local midnight, an empty prior day becomes a closed no-goal display state with all four challenges not met.
- Day 75 does not close the app or create an end date.
- DST boundary tests do not shift a user's local date.

## Phase 6 — Weekly leeway, group tracker, Board, and Person

**Depends on:** Phases 3–5  
**Master slice:** daily count leaderboard and group tracker

Tasks:

- Implement current-local-date challenge counts.
- Reset each member's Board score at their local midnight.
- Implement group strip dots and today's achieved count.
- Implement Board competition ranking with no secondary tie-break.
- Implement Person calendar, current-day count, achievements placeholder, and posts.

Acceptance:

- Every active member's Board row uses only that member's current local date.
- A member's score resets to 0 at their local midnight; prior-day counts are not carried forward.
- Different timezones can produce different score dates at the same instant.
- Late joiners begin with a 0 score on their first eligible local day; no cumulative backfill is applied.
- Board uses required challenges achieved only and uses competition ranking for ties.

## Phase 7 — Optional personal goals

**Depends on:** Phase 3 and Phase 4  
**Master slice:** private optional goals

Tasks:

- Implement add/edit/archive optional goals.
- Implement checkbox and numeric quiet logs for today/yesterday.
- Show optional goals only to the owner unless copied into a post.
- Add owner-only optional-goal streak toast behavior.

Acceptance:

- A member cannot read or mutate another member's optional goals/logs.
- Optional logs never alter required dots, daily challenge count, or Board.
- An optional-only post can display its selected optional goal.
- Archived goals remain historically understandable but cannot be logged as active.

## Phase 8 — Achievements and admin

**Depends on:** Phases 4–7  
**Master slice:** achievements, invalidate/delete/remove

Tasks:

- Implement fixed and initial hidden achievement catalog.
- Evaluate achievements idempotently after relevant actions and Day 75 reads.
- Enforce one display toast per action.
- Implement admin invite display/rotation.
- Implement member list, day invalidation, member removal, admin post deletion, and audit log.

Acceptance:

- Quiet taps do not unlock `FIRST_UPDATE`.
- A first full required day unlocks `FIRST_FULL_DAY` once.
- Hidden entries render `???` until unlocked.
- Invalidation forces all four required challenges to not met without deleting its posts.
- Removed members lose group access.
- Admin actions are audited and ordinary members cannot call them.

## Phase 9 — Hardening and release

**Depends on:** Phases 0–8  
**Ships:** production candidate

Tasks:

- Run full unit, component, browser, RLS, and migration tests.
- Test photo cleanup, duplicate retries, session expiry, and OAuth failure paths.
- Add rate limiting, security headers, error monitoring, and structured server logs.
- Measure mobile loading and tap latency.
- Configure production Auth redirect URLs, environment variables, backups, and rollback procedure.
- Perform a private-group acceptance session with representative timezones.

Release gates:

- No critical or high security findings.
- No known scoring discrepancy in the golden test matrix.
- No route exposes data to anonymous or non-member users.
- Production migration is rehearsed against a disposable database.
- The operator can rotate the invite and remove a test member.
- The app contains no unapproved Rules, Calendar, Notifications, Chat, or Water tabs.

## Vertical delivery checkpoints

| Checkpoint | User-visible proof |
|------------|--------------------|
| Alpha | Invite → signup → Today → quiet log works for one member |
| Social beta | Two members see group dots, posts, reactions, and comments |
| Scoring beta | Yesterday closure, late join, local-midnight reset, daily Board, and Person agree with fixtures |
| Admin beta | Invite rotation, invalidation, removal, and audit checks pass |
| Release candidate | Full matrix passes on mobile and desktop with production-like RLS |

