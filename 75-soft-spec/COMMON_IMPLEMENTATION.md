# 75 Soft — Common Implementation Contract

**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Execution plan:** [PARALLEL_WORKSTREAMS.md](./PARALLEL_WORKSTREAMS.md)  
**Status:** W0 implemented; local contract gate passed; remote Supabase/RLS matrix remains an integration check

This is the shared contract every implementation agent must read before changing code. It contains reusable primitives, canonical types, cross-feature boundaries, and file ownership rules. It is not a general-purpose scratchpad.

## 0.1 W0 implementation map

The W0 baseline is implemented at the repository root. These are the canonical
entry points domain workstreams consume:

```text
lib/config/75-soft.ts              constants and product limits
lib/config/env.ts                  validated public/server environment
lib/types/index.ts                 shared DTOs and domain unions
lib/dates/index.ts                 local-date and timezone utilities
lib/scoring/index.ts               pure required-goal and daily-board primitives
lib/http/index.ts                  JSON response, error, and guard wrappers
lib/auth/access.ts                 session, member, and admin guards
lib/idempotency/index.ts           client operation-id helpers
lib/query-keys/index.ts            TanStack Query key factory
lib/supabase/browser.ts            browser client
lib/supabase/server.ts             cookie-aware server client
lib/supabase/admin.ts              server-only service-role client
lib/supabase/database.types.ts     typed core schema baseline
lib/storage/index.ts               media validation and storage boundaries
lib/validation/index.ts            shared Zod schemas
components/ui/                     touch-sized UI primitives
components/app-shell/              protected shell and placeholders
components/feedback/               loading, empty, retry, toast, and status UI
components/sheets/                 accessible sheet primitive
components/lightbox/               accessible photo lightbox
tests/fixtures/75-soft/index.ts    shared users, dates, events, and score fixtures
database/migrations/0001_core.sql  core schema, functions, grants, and RLS
```

The runnable baseline commands are `npm run typecheck`, `npm run lint`,
`npm test`, `npm run test:e2e`, and `npm run build`. The root `README.md`
contains the local setup sequence and the server-only secret boundary.

## 1. Common-first gate

The coordinator starts one foundation agent on this document. No domain agent starts implementation until the foundation agent has:

- created the project/tooling baseline;
- created shared config, types, date, HTTP, session, and Storage helpers;
- created the core database migration and RLS helper functions;
- created test fixtures and the required test commands;
- run build, lint, typecheck, and the common test suite;
- documented the exact exported interfaces in this file or linked source files.

After that gate, common files are frozen. Domain agents consume them but do not edit them. A contract change is made by the coordinator and announced to all active agents before they rebase.

## 2. Baseline stack

Use the baseline from [IMPLEMENTATION_INDEX.md](./IMPLEMENTATION_INDEX.md):

- Next.js App Router with strict TypeScript;
- Tailwind CSS and shared UI primitives;
- TanStack Query for server state;
- React Hook Form and Zod for forms;
- Supabase Auth, PostgreSQL, and private Storage;
- Vitest, React Testing Library, Playwright, and local Supabase/RLS tests.

The stack is an implementation assumption, not a new product rule. A replacement must preserve the contracts below.

## 3. Canonical configuration

Create one server/client-safe configuration module, for example `lib/config/75-soft.ts`. No component or domain module may duplicate these values.

```text
COHORT_START_DATE = 2026-09-01
REQUIRED_GOAL_KEYS = [workout, water, reading, diet]
WORKOUT_TARGET_MINUTES = 45
WATER_TARGET_ML = 2000
READING_TARGET_PAGES = 10
DEFAULT_REACTION_PALETTE = [👍, 🔥, 😂, ❤️, 💪]
MAX_POST_PHOTO_BYTES = 5 MB
MAX_COMMENT_CHARACTERS = 256
EDITABLE_DAY_OFFSET = [0, -1]
```

Use integer milliliters for water. Keep product labels and units beside the goal definition so API, UI, and tests cannot drift.

## 4. Canonical shared types

Create shared types in `lib/types/` before feature work:

```text
RequiredGoalKey = 'workout' | 'water' | 'reading' | 'diet'
MembershipRole = 'member' | 'admin'
PostStatus = 'pending' | 'published' | 'deleted' | 'failed'
DayDisplayState = 'unscored' | 'future' | 'open' | 'in_progress' | 'partial' | 'complete' | 'missed'
```

Required shared DTOs:

- `ProfileDTO`
- `DayRollupDTO`
- `DailyBoardDTO`
- `CalendarCellDTO`
- `PostDTO`
- `PostGoalDTO`
- `CommentDTO`
- `ReactionSummaryDTO`
- `AchievementDTO`
- `BoardEntryDTO`
- `ContainerDTO`
- `OptionalGoalDTO`

DTO rules:

- IDs are strings;
- dates are ISO `YYYY-MM-DD` strings without a timezone suffix;
- instants are ISO UTC strings;
- API fields are camelCase;
- DTOs contain derived values returned by the server, not client-recomputed scores;
- private optional-goal data and raw day events never appear in group DTOs.

## 5. Canonical date utilities

Own all date arithmetic in `lib/dates/`. Required functions:

```text
getMemberLocalDate(nowInstant, ianaTimezone): ISODate
getYesterday(localDate): ISODate
getDayNumber(localDate, cohortStartDate): number
isEditableDate(localDate, memberLocalDate, joinLocalDate, invalidated): boolean
isScoredCalendarDate(localDate, joinLocalDate, cohortStartDate): boolean
formatInstantForViewer(instant, viewerTimezone): string
```

Rules:

- use IANA timezones, never fixed offsets;
- use calendar-date arithmetic, never elapsed 24-hour arithmetic;
- derive the actor's local date on the server;
- treat a client date as an assertion to validate, never as authority;
- keep historical `localDate` values stable after a timezone change;
- include DST and midnight fixtures in the common test suite.

The cohort has no weekly scoring. Calendar weeks may be used only to group grid cells.

## 6. Canonical scoring interface

The scoring service is shared by day tracking, Board, Person, admin, and achievements. It must expose one implementation boundary, for example:

```text
getDayRollup(userId, localDate, asOfInstant)
getDailyBoardScore(userId, asOfInstant)
getDailyBoard(viewerId, asOfInstant)
getCalendar(userId, range, asOfInstant)
```

The implementation must:

- sum quiet amount deltas and published post entries;
- calculate diet state from the agreed event model;
- apply admin invalidation;
- return independent met/not-met state for all four required challenges;
- return descriptive day state without treating it as aggregate pass/fail;
- use only the member's current local date for the daily Board;
- reset a member's Board score at that member's local midnight;
- apply competition ranking (`RANK`, `1, 1, 3`);
- never include optional goals or prior-day totals in Board ranking.

Domain agents call this interface instead of writing their own SQL or date logic. The scoring implementation may live in the day-tracking workstream, but its exported contract is common.

## 7. Canonical mutation and idempotency

Every user mutation that can be retried carries a UUID `clientOperationId`:

- amount addition;
- diet toggle;
- optional-goal log;
- post creation;
- comment creation if the client supports retry.

The database enforces uniqueness within the actor's scope. Retrying an operation returns the original result and a fresh derived DTO. A new user tap always gets a new operation id.

Shared mutation rules:

- derive actor from the session;
- validate membership and ownership server-side;
- validate editable date server-side;
- run additive writes and derived reads transactionally where practical;
- do not expose service-role credentials;
- use stable error codes.

## 8. Canonical HTTP contract

Create `lib/http/` helpers for:

```text
ok(data, status?)
paginated(data, nextCursor)
fail(status, code, message, details?)
requireSession(request)
requireActiveMember(session)
requireAdmin(session)
```

Every successful JSON response uses `{ data: ... }`; paginated responses use `{ data: [], nextCursor }`.

Stable error codes:

```text
VALIDATION_ERROR
AUTH_REQUIRED
FORBIDDEN
NOT_FOUND
CONFLICT
PAYLOAD_TOO_LARGE
UNSUPPORTED_MEDIA_TYPE
BUSINESS_RULE_VIOLATION
RATE_LIMITED
INTERNAL_ERROR
```

Routes must not duplicate status/error serialization. Domain agents add schemas and handlers, but use the common response helpers.

## 9. Canonical Supabase/session boundary

Create:

```text
lib/supabase/browser.ts       // browser-safe client
lib/supabase/server.ts        // request/session-aware server client
lib/supabase/admin.ts         // server-only service-role client
proxy.ts                      // session refresh and protected route shell
lib/auth/access.ts            // active member/admin guards
```

Rules:

- `admin.ts` is server-only and must fail a client-bundle import check;
- application data reads and writes use route handlers or approved server services;
- Auth identity operations may use Supabase Auth's browser API;
- active membership is checked in the protected layout and every route/RPC;
- admin role is read from the database, never from client state;
- removed members cannot read group data.

## 10. Canonical Storage boundary

Create `lib/storage/` with:

```text
validateImage(file, allowedTypes, maxBytes)
buildPostPhotoPath(authorId, postId, randomId, extension)
createMemberSignedUrl(memberScopedClient, path, expiresInSeconds?)
deletePostPhoto(memberScopedClient, path)
```

The current implementation accepts a typed, member-scoped Supabase client so
RLS remains part of the call boundary; it does not accept a caller-supplied
viewer id as an authorization substitute.

Use private bucket `post-photos` and:

```text
posts/{author_id}/{post_id}/{random_id}.{jpeg|png|webp}
```

The server checks MIME type and actual byte length. A post is visible only after its photo upload succeeds; failed/pending posts do not contribute to rollups. Storage cleanup is compensating, not assumed transactional.

## 11. Canonical validation boundary

Shared Zod or equivalent schemas belong in `lib/validation/`:

- required goal keys and canonical amounts;
- water ml/l conversion;
- ISO local dates;
- comment length;
- display name;
- IANA timezone;
- reaction palette entries;
- photo type/size;
- operation ids.

Client schemas improve feedback. Server schemas and database constraints decide acceptance.

## 12. Canonical database foundation

Use independent forward-only migrations rather than one shared mutable schema file. The foundation migration owns:

- `profiles`;
- `cohorts`;
- `memberships`;
- `invite_codes`;
- `signup_intents`;
- `audit_log`;
- timestamp/updated-at helpers;
- `is_active_member(user_id)`;
- `is_admin(user_id)`;
- active-cohort lookup;
- base RLS and secure function grants.

Domain migrations own their tables and policies in separate numbered files. No domain agent edits another domain's migration.

All derived values are read views/RPC results. Do not add redundant counters to profiles or membership rows.

## 13. Common UI primitives

The foundation agent owns:

```text
components/ui/
components/app-shell/
components/feedback/
components/sheets/
components/lightbox/
```

Required shared behaviors:

- 44×44 touch targets;
- safe-area-aware bottom navigation;
- accessible focus trapping/restoration for sheets and lightbox;
- skeleton, empty, retry, and unauthorized states;
- text and icon status in addition to color;
- optimistic mutation status/live-region helpers;
- mobile-first responsive layout.

Domain agents compose these primitives and do not create competing sheet, toast, or error systems.

## 14. Common query and cache conventions

Use TanStack Query keys with actor/date scope:

```text
['session']
['profile', 'me']
['day', userId, localDate]
['group-strip', asOfLocalDate]
['board', asOfInstantBucket]
['feed', cursor]
['post', postId]
['person', userId]
['containers', userId]
['optional-goals', userId]
['achievements', userId]
['admin', 'members']
['admin', 'invite']
```

The coordinator owns invalidation policy changes. Feature agents may add keys only under their namespace and must document dependent invalidations.

## 15. Common test fixtures

Create reusable fixtures in `tests/fixtures/75-soft/`:

- active admin and two active members;
- removed member;
- cohort start `2026-09-01`;
- representative IANA timezones;
- day deltas and published/deleted/pending posts;
- diet event sequences;
- invalidated date;
- equal daily Board scores;
- late join date;
- local-midnight and DST instants.

Every domain agent imports these fixtures rather than inventing incompatible seed data.

## 16. Shared file ownership

After the common-first gate, these paths are coordinator-owned or foundation-owned:

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
tests/fixtures/75-soft/
database/migrations/0001_core.sql
package.json
tsconfig.json
proxy.ts
```

Domain agents must not edit them directly. A required change is reported as a contract request with:

```text
requested file
current interface
proposed change
reason
affected workstreams
tests to update
```

## 17. Common completion gate

The common implementation is complete only when:

- a clean install builds;
- lint and typecheck pass;
- common date/scoring contract tests pass;
- RLS helper tests pass for anonymous/member/admin/removed contexts;
- client bundle contains no service-role import;
- all exported DTOs and error codes are documented;
- each workstream can create its branch without modifying common files;
- the coordinator has recorded the commit/branch hash used by all parallel agents.

