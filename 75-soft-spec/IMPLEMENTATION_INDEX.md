# 75 Soft — Implementation Subspecs

**Parent specification:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Product summary:** [README.md](./README.md)  
**Status:** Implementation draft for review  
**Applies to:** v1 private-group web app

This package decomposes the product rules into implementation-ready subspecs. The master spec remains the source of truth for product behavior. These documents define the technical shape, validation boundaries, delivery order, and testable acceptance criteria.

## Baseline implementation assumptions

The master spec does not prescribe a technology stack. These subspecs use the following replaceable baseline so that the data and API decisions are concrete:

| Layer | Baseline |
|-------|----------|
| Web app | Next.js App Router, TypeScript, strict mode |
| UI | Tailwind CSS with a small shared component layer |
| Server state | TanStack Query |
| Forms and validation | React Hook Form + Zod |
| Auth, database, storage | Supabase Auth, PostgreSQL, and private Storage |
| Hosting | Vercel for the web app; Supabase Cloud for backend services |
| Testing | Vitest, React Testing Library, Playwright, and Supabase/RLS integration tests |

The baseline may change without changing the product contract, provided the invariants in this package remain true.

## Package map

| Document | Responsibility |
|----------|----------------|
| [COMMON_IMPLEMENTATION.md](./COMMON_IMPLEMENTATION.md) | Shared types, utilities, contracts, foundation gate, and ownership rules |
| [PARALLEL_WORKSTREAMS.md](./PARALLEL_WORKSTREAMS.md) | Coordinator loop, isolated agent briefs, dependencies, and merge gates |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Runtime boundaries, project structure, state flow, storage, and security |
| [AUTH_AND_ACCESS.md](./AUTH_AND_ACCESS.md) | Invite-gated signup, login, account linking, membership, and profile access |
| [DATA_MODEL.md](./DATA_MODEL.md) | Tables, constraints, derived data, indexes, RLS, and storage |
| [SCORING_AND_ROLLUPS.md](./SCORING_AND_ROLLUPS.md) | Local dates, day rollups, daily leaderboard, invalidation, and achievements |
| [API_CONTRACTS.md](./API_CONTRACTS.md) | Route contracts, DTOs, errors, pagination, and mutation invalidation |
| [UI_AND_NAVIGATION.md](./UI_AND_NAVIGATION.md) | Routes, tabs, sheets, screen behavior, and interaction requirements |
| [PHASES_AND_ACCEPTANCE.md](./PHASES_AND_ACCEPTANCE.md) | Delivery slices, dependencies, and acceptance criteria |
| [TESTING_AND_OPERATIONS.md](./TESTING_AND_OPERATIONS.md) | Test matrix, security checks, observability, deployment, and release gates |
| [IMPLEMENTATION_REVIEW.md](./IMPLEMENTATION_REVIEW.md) | Cross-document review, risks, and decisions requiring confirmation |

## Implementation dependency order

```text
W0. Common foundation and reusable contracts
    ├─ W1 Auth/access/profile
    ├─ W2 Day tracking/containers/rollups
    ├─ W3 Posts/feed/social/media
    ├─ W4 Board/Person/calendar reads
    ├─ W5 Optional goals
    ├─ W6 Achievements
    ├─ W7 Admin/moderation
    └─ W8 Contract/RLS/regression tests
        └─ W9 Integration hardening and release
```

W0 is the only required serial foundation. W1–W8 use the frozen common contract and run in parallel in isolated branches/worktrees. The complete execution protocol is [PARALLEL_WORKSTREAMS.md](./PARALLEL_WORKSTREAMS.md).

## Cross-cutting invariants

These rules must be enforced on the server and, where practical, in the database. Client checks are for feedback only.

1. A user cannot create an app account without a valid reusable group invite.
2. Only an active group member can read group data or mutate their own data.
3. Members can mutate only their own day, optional goals, profile, containers, posts, comments, and reactions.
4. A member can write only today or yesterday in that member's local timezone.
5. Required amounts are additive. A post amount is a real log and must not be treated as display-only.
6. Quiet logging never creates a feed item. Only a submitted Post update creates a feed item.
7. A deleted post removes its logged amounts and causes that date's rollup and all derived counts to recalculate.
8. An invalidated day has all four required challenges forced to not met; its posts remain visible and its daily Board score is 0.
9. Optional goals never affect required-goal totals, daily challenge count, or the main leaderboard.
10. No future day, pre-start day, or pre-membership day contributes to scoring.
11. The main leaderboard is for the member's current local day only and resets at that member's local midnight.
12. There is no aggregate daily or weekly pass/fail result; only the four required challenges are met or not met.
13. No notification center, push notification, chat, rules explainer, or additional bottom tab may be introduced as an implementation shortcut.

## Product decisions intentionally preserved as configuration

The following values must be centralized rather than scattered through components or SQL:

```text
COHORT_START_DATE = 2026-09-01
REQUIRED_GOALS = workout, water, reading, diet
WORKOUT_TARGET_MINUTES = 45
WATER_TARGET_ML = 2000
READING_TARGET_PAGES = 10
DEFAULT_REACTIONS = 👍 🔥 😂 ❤️ 💪
MAX_POST_PHOTO_BYTES = 5 MB
MAX_COMMENT_CHARACTERS = 256
EDITABLE_DATES = today, yesterday
```

## Conflict and change policy

When documents disagree, resolve them in this order:

1. Explicit locked decision or formula in `MASTER_SPEC.md`
2. Other explicit product behavior in `MASTER_SPEC.md`
3. The relevant implementation subspec
4. Code or database behavior

An implementation that needs to change a product rule must update `MASTER_SPEC.md` first, then update affected subspecs and tests. Do not silently encode a new product decision in a migration or component.

