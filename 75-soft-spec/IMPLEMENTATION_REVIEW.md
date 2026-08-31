# 75 Soft — Implementation Subspec Review

**Reviewed documents:** all files linked from [IMPLEMENTATION_INDEX.md](./IMPLEMENTATION_INDEX.md)  
**Compared against:** [MASTER_SPEC.md](./MASTER_SPEC.md) v0.9  
**Review status:** Complete; product confirmation still needed for listed decisions

## 1. Overall assessment

The subspec package is internally coherent and gives an implementation team a usable sequence from foundation through release. The strongest parts are:

- scoring is centralized in one calculation contract rather than duplicated in UI code;
- amount logging is additive and idempotent;
- post entries are explicitly included in rollups, so feed behavior cannot accidentally become display-only;
- the private-group boundary is carried through routes, RLS, signed media URLs, and tests;
- the three-tab/sheet navigation constraint is explicit;
- reusable contracts and exclusive file ownership make parallel workstreams practical;
- the phase plan puts RLS and golden scoring fixtures before social polish.

The package is ready to guide the common foundation and parallel workstreams. It is not ready for an unreviewed production build until the remaining product decisions in §4 are confirmed.

## 2. Consistency corrections made during review

The review found and corrected these implementation gaps:

1. Optional checkbox posts now have a dedicated `optional_completed` field rather than relying on a numeric value.
2. Post creation now requires a client operation id so retrying a photo/multipart request cannot duplicate scoring.
3. Invite validation has one deterministic response (`200` with `valid: false`) instead of leaving status behavior open.
4. Submitted post dates are explicitly client assertions; the server derives and checks today/yesterday from the actor's stored timezone.
5. The Today query key includes user and local date rather than only a cohort day number.
6. A post's selected required/optional goal is protected against duplicate entries by partial unique indexes.

## 3. Decisions confirmed in this review

The product owner clarified:

- each required track—Workout, Water, Reading, and Diet—is an independent met/not-met challenge;
- there is no weekly pass/fail and no aggregate daily pass/fail;
- the Board ranks only the current local day's required-challenge count;
- each member's Board score resets at that member's local midnight;
- ties use competition ranking (`1, 1, 3`).

## 4. Decisions requiring product confirmation

These are not implementation bugs; the master spec leaves them underspecified or open to more than one valid behavior.

### P0 — confirm before finalizing scoring implementation

1. **Diet event precedence.** The subspec treats the latest active event across quiet toggles and published diet posts as authoritative; deleting a post reveals the previous event. Confirm that this matches the intended “tap to unset” behavior.
2. **Invalidation permanence.** The subspec currently has no restore action and keeps an invalidated date's four challenges not met. Confirm whether an admin needs an explicit restore operation.

### P1 — confirm before social/admin release

3. **Removed-member history.** The subspec soft-removes a member, hides them from active group views, and retains their posts unless an admin deletes them. Confirm whether historical posts should remain visible, be anonymized, or be removed.
4. **Achievement catalog.** The master calls the hidden achievements examples. The subspec proposes seven exact initial hidden rules so they can be tested. Confirm that this is the intended v1 catalog and wording.
5. **Achievement rollback.** The subspec makes unlocks monotonic even if an admin later invalidates source data. Confirm whether moderation should revoke a previously displayed achievement.
6. **Optional-goal streak behavior.** The master requires owner-only toasts but does not define the streak calculation or wording. Confirm whether simple consecutive local dates and target completion are acceptable.

### P2 — confirm before UX polish

7. **Timezone changes.** The subspec preserves historical local dates and uses the new timezone for future activity. Confirm this behavior for a user who changes timezone around midnight.
8. **Technical limits not in the master.** A maximum note length, profile-photo byte limit, reaction-palette size, display-name length, invite format, and rate limits still need concrete values. They should be centralized and documented as technical constraints, not silently treated as product rules.
9. **Photo upload behavior.** The subspec uses a pending-post → Storage upload → published-post flow with cleanup. Confirm that a post should not appear in the feed until the photo is fully uploaded.
10. **Google signup profile photo.** The master requires name plus photo, but Google may provide a provider avatar while email signup needs a file upload. Confirm whether a provider avatar satisfies initial signup or whether every user must upload/capture a photo.

## 5. Highest technical risks

| Risk | Why it matters | Mitigation in subspecs |
|------|----------------|------------------------|
| Date/timezone drift | A one-day error changes challenge state and daily Board counts | Persist local dates, use IANA zones, share utilities, run DST fixtures |
| Double counting | A retry or post amount can inflate a score | Operation ids, unique constraints, transactional RPCs, golden tests |
| Diet ambiguity | Toggle, post, and deletion can disagree | Ordered event semantics and explicit product confirmation |
| RLS leakage | Group privacy is the product boundary | RLS matrix, aggregate RPCs, signed private photos, real-context tests |
| Storage/database split | Storage has no database transaction | Pending status, compensation, cleanup monitoring |
| Unbounded derived queries | Calendar/Person reads can rescan historical events | Indexes first; query plans; introduce safe caching only after measurement |
| OAuth invite bypass | Provider auth can exist before app membership | Signed intent, callback revalidation, no membership without invite |

## 6. Recommended next step

1. Confirm the two remaining P0 decisions.
2. Confirm the baseline stack or replace it in `IMPLEMENTATION_INDEX.md`.
3. Run W0 from `PARALLEL_WORKSTREAMS.md` and freeze the common contract.
4. Launch W1–W8 in isolated branches/worktrees, using fixtures/stubs for unmerged dependencies.
5. Merge at the integration gate and rerun migration, scoring, RLS, and browser checks.

## 7. Parallelization review

The parallel plan is workable because it leaves one intentional serial gate—W0—and gives each domain agent exclusive code paths. The main coordination risks are shared DTO changes, database migration ordering, and Today-page composition; the plan addresses them with a frozen common contract, numbered independent migrations, private route fragments, and coordinator-owned integration.

The unattended loop can proceed with the two provisional behaviors already documented for diet events and invalidation. It must stop for a security leak, a migration/data-loss risk, or a contradiction with the master spec rather than allowing an agent to make an unreviewed product decision.

No runtime tests were run in this review because the workspace currently contains specifications but no application or database implementation.

