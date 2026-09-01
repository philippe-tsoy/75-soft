# 75 Soft — Teams, Percentage Completion, and Daily Photo Update (Change Spec)

**Status:** Proposed — pending approval. Not yet merged into `MASTER_SPEC.md` or the other subspecs.
**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)
**Amends:** MASTER_SPEC §5, §7, §10, §11, §13, §15–18, §20, §21 (§14 Day display state is unaffected); [DATA_MODEL.md](./DATA_MODEL.md); [SCORING_AND_ROLLUPS.md](./SCORING_AND_ROLLUPS.md); [API_CONTRACTS.md](./API_CONTRACTS.md); [UI_AND_NAVIGATION.md](./UI_AND_NAVIGATION.md); [PHASES_AND_ACCEPTANCE.md](./PHASES_AND_ACCEPTANCE.md); [TESTING_AND_OPERATIONS.md](./TESTING_AND_OPERATIONS.md)

This document specifies three related changes and how they interact. Per the project's own [conflict and change policy](./IMPLEMENTATION_INDEX.md#conflict-and-change-policy), once approved, `MASTER_SPEC.md`'s locked-decision table must be updated first, then the affected subspecs — this document is that proposal, written so it can be merged in directly.

## 0. Summary

1. **Teams** — member-created groups. A member belongs to at most one team at a time.
2. **Percentage completion** — a new cumulative metric (individual / team / global), separate from the existing daily `goals_achieved_today` board score.
3. **Mandatory daily photo update** — every Post update now requires a photo. Required-goal amounts are no longer entered inside the Post sheet; they're read from that day's already-logged progress, and the sheet is gated on 4/4 completion. Today gains one-tap "Mark done" chips so reaching 4/4 is always fast.

No new bottom tab is introduced (cross-cutting invariant #13 is preserved). Team management lives in **Me**; a team's detail is a **pushed screen** reached from **Board**, the same pattern as Person.

---

## 1. Locked-decision amendments

| Topic | Current (`MASTER_SPEC.md` §20) | Amended |
|---|---|---|
| Photo | "Optional on posts; camera or upload; 5 MB" | **Required** on every Post update; camera or upload; 5 MB. The sheet cannot submit without one. |
| Post update contents | User selects required and/or optional goals and enters amounts in the sheet | Required-goal section becomes a **read-only recap** of that date's rollup. The sheet **cannot be opened for compose** unless all 4 required goals are already met for the selected date — see §4. Optional goals keep today's fully editable behavior, unchanged. |
| Groups | Single shared cohort only | Adds **teams**: optional, member-created, one per member at a time. Teams do not gate access to anything — a teamless member uses the app exactly as today. |
| Leaderboard | Only `goals_achieved_today` count, resets at local midnight | Unchanged and still primary. **Adds** a separate, non-resetting **percentage completion** metric at individual/team/global levels — see §3. |
| Admin capabilities | Rotate code, remove member, invalidate day, delete post | + Rename any team at any time (moderation for a bad name). No bulk team eviction exists — see §2.1. |

New invariant to add to the cross-cutting list (§ MASTER_SPEC "Cross-cutting invariants"):

> 14. Every Post update, at every occurrence (not just the first per day), requires a photo. The server rejects publish without one.
> 15. A Post update cannot be created for a date whose four required challenges are not all met. Required-goal data attached to a post is a read-only snapshot of that date's rollup at publish time, not a second additive log — a post must never double-count an amount already recorded by a quiet tap or a Mark-done action.
> 16. Team membership is single-valued per user (a member is on at most one team at a time) and does not gate scoring, posting, or any existing feature. Leaving/switching teams does not rewrite a member's historical attribution to the team(s) they were actually on at the time.

Invariant #5 ("A post amount is a real log and must not be treated as display-only") is **narrowed**: it still governs quiet `day_deltas` and the new Mark-done top-up (§4.2), but no longer applies to the required-goal fields on a Post update, which are now display-only by design (new invariant #15 above supersedes it for that one case).

---

## 2. Teams

### 2.1 Product behavior

- Any active member can create a team by naming it. They become its first member.
- Any active member can browse the list of teams and join one, or leave their current team, at will. Joining a new team while already on one first leaves the old one.
- A team roster (members, their today's dots, individual percentage) is visible to **all** active members, consistent with principle #2 ("Everyone in the group sees everyone else's progress") — teams don't introduce privacy.
- Admin can **rename** a team at any time (moderation for a bad/abusive/duplicate name) — this never affects membership or history.
- There is deliberately **no bulk "archive/delete a team" action**, so admin can never forcibly evict a whole roster in one step. If a specific member needs to be removed from a team (abuse, mistake), admin uses the existing per-member leave control (§2.2) one member at a time — the same lever a member has over their own membership. A team that every member has voluntarily left simply stops appearing in `GET /api/teams` and the Teams board once its `memberCount` reaches 0; its historical goal-day attribution is preserved for percentage accuracy, but there's no separate archived state to manage.
- No team-size cap, no minimum, no approval step. (Flagged as an easy knob to add later if needed — not requested.)

### 2.2 Data model

New tables (add to [DATA_MODEL.md](./DATA_MODEL.md) §3):

**`teams`**

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `cohort_id` | uuid | FK |
| `name` | text | Required, trimmed, 2–40 chars; unique per cohort case-insensitively |
| `created_by` | uuid | FK profiles |
| `created_at` | timestamptz | |

No `archived_at`/soft-delete column: a team is never forcibly torn down (§2.1). A team can reach zero active members through voluntary leaves, at which point it just stops being returned by the "live teams" reads in §2.3 — its row and every past `team_memberships` period stay intact so historical team percentage figures never change retroactively.

**`team_memberships`**

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `team_id` | uuid | FK teams |
| `user_id` | uuid | FK profiles |
| `joined_at` | timestamptz | |
| `left_at` | timestamptz nullable | null = currently on this team |
| `created_at` | timestamptz | |

Constraints: partial unique index on `(user_id) where left_at is null` (at most one active team per user); index `(team_id, left_at)` and `(user_id, left_at)` for roster/history lookups.

This is deliberately **effective-dated** rather than a single `team_id` column on `memberships`, because teams are member-created and switching is expected to happen casually. Effective-dating means a member who switches teams mid-challenge keeps their prior goal-days attributed to the team they actually earned them on — a simple `team_id` column would silently rewrite history on every switch and let team-hopping inflate or sandbag a team's average. If team switching turns out to be rare in practice, this can be simplified later to a single column; start with the accurate version since it's cheap to build.

RLS: `teams` select = active members; insert = any active member (self as creator); update (rename only — there is nothing else to update) = creator or admin. `team_memberships` select = active members (rosters are public within the group); insert = the member themself (join) or admin; update (`left_at`, i.e. leave) = the member themself, or admin acting on any single member (the per-member moderation lever from §2.1).

### 2.3 New reads

| Read | Returns |
|---|---|
| `get_team_board(viewer_id)` | Teams with `memberCount > 0` ("live"), ranked by team percentage completion (§3), each row: `{ team, memberCount, teamPct, rank }`. Competition ranking on ties, same rule as the individual board. A team that just dropped to 0 members simply falls out of this list on the next read — no flag to set. |
| `get_team_summary(viewer_id, teamId)` | `{ team, teamPct, rank, members: [{ profile, individualPct, todayGoalDots, goalsAchievedToday }] }` for the pushed Team screen. Resolves even for a 0-member team (someone may still land here from a stale link or a teammate's history), just with an empty roster. |
| `get_my_team(viewer_id)` | The viewer's current team (or null) plus their own percentages. Backs the new `GET /api/teams/me` in §2.4. |

### 2.4 API additions ([API_CONTRACTS.md](./API_CONTRACTS.md) §new)

```
GET    /api/teams                  # list live teams (memberCount > 0) + memberCount + teamPct, for browsing/joining
POST   /api/teams                  # { name } -> creates team, joins creator
GET    /api/teams/:id              # get_team_summary
GET    /api/teams/me               # get_my_team — the caller's current team + own percentages, or null
POST   /api/teams/:id/join         # joins caller (closes any existing active team_membership)
POST   /api/teams/leave            # { userId? } -> leaves caller's current team;
                                    # admin may pass userId to remove a specific member from their
                                    # current team instead (the per-member moderation lever, §2.1) —
                                    # a non-admin caller may only ever act on themself
PATCH  /api/teams/:id              # admin or creator only: { name } — rename only, nothing else to set
```

Errors follow the existing envelope: duplicate name → `409 CONFLICT`; join/leave while not an active member → `403 FORBIDDEN`; unknown team → `404 NOT_FOUND`; non-admin passing `userId` for someone else → `403 FORBIDDEN`.

### 2.5 UI additions ([UI_AND_NAVIGATION.md](./UI_AND_NAVIGATION.md))

- **Me screen**: new "My team" block — current team name + leave action, or "Join a team" / "Create a team" if teamless. Sits alongside the existing Optional goals block.
- **Board screen**: add a segmented control at the top — **Individual** (existing, unchanged) / **Teams** (new). Teams view lists teams ranked by `teamPct`; tapping a row pushes the new **Team** screen.
- **Team screen** (pushed, like Person): team name, rank, `teamPct`, roster list (photo, name, today's dots, individual `%`). No edit controls unless viewer is admin or the team's creator (rename only; archiving stays admin-only).
- Optional, non-blocking enhancement: show a small team-name badge next to a member's row in the Today group strip and on Person, since the team is now part of their identity. Not required for v1 of this change.

---

## 3. Percentage completion

### 3.1 Definition

A cumulative, non-resetting measure of how much of the challenge-so-far has actually been completed, at goal-day granularity (4 required goals × each scored day). This is distinct from the existing daily `goals_achieved_today` board score, which only ever reflects the current local day and resets at midnight.

```text
scored_local_dates(user) =
  { d : d >= 2026-09-01
        AND d >= user.join_local_date
        AND d <= member_local_today(user) }

-- an invalidated day is still a scored day (met_count forced to 0), per existing rule;
-- it is included in the denominator, contributing 0 to the numerator.

individual_numerator(user)   = sum over d in scored_local_dates(user) of met_count(user, d)
individual_denominator(user) = 4 * count(scored_local_dates(user))
individual_pct(user)         = 0 if denominator == 0 else round(100 * numerator / denominator)
```

`met_count` is the existing function from [SCORING_AND_ROLLUPS.md](./SCORING_AND_ROLLUPS.md) §4. Today (the member's current local date) is included and uses its live, in-progress `met_count` — the number moves in real time as goals are met, same spirit as the existing board score.

```text
team_numerator(team)   = sum over (user, d) where user is on `team` per team_memberships
                          at the time local date d occurred, of met_count(user, d)
team_denominator(team) = 4 * count of such (user, d) pairs
team_pct(team)         = 0 if denominator == 0 else round(100 * numerator / denominator)

global_numerator   = sum over all active members of individual_numerator(user)
global_denominator = sum over all active members of individual_denominator(user)
global_pct         = round(100 * global_numerator / global_denominator)
```

Team and global percentages are **pooled across goal-days**, not an average of members' individual percentages. This is the direct extension of the individual formula to a group (a team's percentage is literally "this team's members' goal-days, computed the same way as one person's") and it's fair across teams with different tenure mixes. The alternative — simple average of member percentages, each member weighted equally regardless of how long they've been in — is a real, valid choice if a small team's optics matter more than raw volume; flagged here as the one open knob in this section if you'd rather have it.

### 3.2 Computation strategy: derived on read, nothing stored

Every percentage in this section is **computed fresh on every request**, the same way `get_day_rollup` already sums `day_deltas` on read instead of maintaining a running total column. There is no `individual_pct`/`team_pct`/`global_pct` column anywhere and no background job that recomputes one — this follows the data model's existing rule (`DATA_MODEL.md` intro) not to persist a total that can be derived from the append-only logs. Consequences:

- The numbers can never drift out of sync with the underlying `day_deltas`/`posts` — there's nothing to keep in sync.
- There is no server-side cache to invalidate when a goal is logged. The only "staleness" that can exist is the **browser's** copy of a previous response.

### 3.3 Reads and display

- `GET /api/profiles/:userId` gains `individualPct` — shown on **Person** and **Me**.
- `GET /api/teams/:id` and `GET /api/teams/me` return `teamPct` — shown on the **Team** screen, the Board **Teams** view, and Me.
- A new lightweight read, e.g. `GET /api/board?scope=global-stats` or folded into the existing `/api/board` response, returns `globalPct` — shown as a small header stat on **Board** ("Group at 74%") and optionally on **Today**'s header.

None of this changes `goals_achieved_today`, the existing Board ranking, or any invariant in §10 of `MASTER_SPEC.md` — percentage completion is additive, read-only, and derived entirely from data that already exists (plus the new `team_memberships` table).

### 3.4 Client cache invalidation

The **only** invalidation concern is the browser's TanStack Query cache (the mechanism `API_CONTRACTS.md` §13's "Mutation invalidation map" already governs) — after a mutation, the client needs to be told which queries to refetch so the screen updates without a manual reload. These rows should be merged into that existing table:

| Mutation | Also invalidate |
|---|---|
| Amount/diet log, Mark-done (§4.2) | `individualPct`, the actor's `teamPct` (if any), `globalPct` |
| Post create/delete | same as above, plus feed |
| Team join/leave | `individualPct`, old `teamPct`, new `teamPct`, Team screen(s) for both teams, Team board list |
| Team rename | Team screen, Team board list |
| Admin invalidation | same as amount/diet log |

---

## 4. Mandatory daily photo update

### 4.1 Flow

Opening the Post update sheet for a given date (today or yesterday, same edit window as today) first checks that date's rollup:

```text
open_post_sheet(date):
  rollup = get_day_rollup(user, date)
  if rollup.metCount < 4:
    show a gate state: per-goal met/not-met list + "Finish today's goals" CTA
    -> CTA closes the sheet and opens the Today (or Yesterday) tracker,
       scrolled/focused to the first unmet goal
    -> the compose form (note/photo/optional goals) is not rendered in this state
  else:
    show the compose form:
      - "Today's results" — read-only recap of the 4 required goals and their logged amounts, all shown met
      - Optional goals — unchanged: select, enter amount/checkbox, exactly as today
      - Note — unchanged
      - Photo — REQUIRED now (was optional); camera or upload; jpeg/png/webp; 5 MB max
      - Post action
```

This removes the amount-entry duplication between Today and Post entirely: required-goal logging happens only on Today (quiet taps or the new Mark-done chips below); Post only ever *reads* that day's already-logged state and lets the member share it with a photo. This also directly resolves the original ask for a "quick pass/fail select" on the Post page — that action now lives on Today as Mark-done, and there's nothing left to duplicate on Post.

The gate and photo requirement apply to **every** Post update for a date, not just the first one of the day (multiple posts per day are still allowed, per existing rules — each one still needs 4/4 and a photo).

### 4.2 Today: "Mark done" quick chips

New one-tap action per amount-based required goal (workout, water, reading), alongside the existing chips. Diet already behaves this way (one tap = met) and needs no change.

```text
mark_done(user, date, key):   # key in {workout, water, reading}; date must be editable
  current = current_amount(user, date, key)
  target  = REQUIRED_GOALS[key].target
  if current >= target:
    no-op (chip renders as "Done ✓", disabled)
  else:
    append day_delta(goal_key = key, amount_int = target - current,
                      source = "quiet", client_operation_id = ...)
```

This is a **top-up**, not a flag: it logs exactly enough real minutes/ml/pages to reach the target and nothing more, so it stays a genuine, additive `day_delta` — the existing "amounts are additive real logs" invariant is preserved for every Today action, including this one. It's self-attested in the same spirit the diet goal already is; nothing new is asked of the data model.

### 4.3 Daily nag

Today shows a persistent, non-blocking banner once **any** required goal is met for the current local date and no published post exists yet for that date. It disappears once the member publishes a post for that date. It does not block any other action, and it does not affect scoring — this is purely a reminder, consistent with the choice not to make posting a scoring gate (see §4.5).

### 4.4 Data model changes

`posts` ([DATA_MODEL.md](./DATA_MODEL.md) §3.10):

| Column | Change |
|---|---|
| `photo_path` | Now **required** (`not null`) instead of nullable |
| `required_snapshot` | **New**, `jsonb not null`. Frozen at publish time from that date's rollup: `{ workout: {amount, met}, water: {...}, reading: {...}, diet: {met} }`. Display-only — never summed into any rollup or score. |
| `team_id` | **New**, `uuid nullable`. Denormalized from the author's active team at publish time, so a feed item still shows the team badge the author posted under even if they later switch/leave. Optional nice-to-have, not required to ship this change. |

`post_goal_entries` ([DATA_MODEL.md](./DATA_MODEL.md) §3.11): stops receiving new rows with `required_goal_key` set — required-goal data now lives in `posts.required_snapshot` instead, since it's no longer independently selected or logged. The column and any historical rows are left as-is (no destructive migration); only optional-goal rows (`optional_goal_id` set) are written going forward. If you'd rather clean this up, a follow-up migration could drop the `required_goal_key` path once no code writes to it.

### 4.5 Explicit non-change: scoring stays photo-independent

`goal_met`, `met_count`, `goals_achieved_today` (daily Board score), and the new percentage-completion formulas in §3 are computed purely from `day_deltas` + the Mark-done top-ups — **never** from whether a photo was posted. Posting is a social/accountability layer on top of scoring, not a gate on it. (This was an explicit choice — the alternative, where an unposted day can't count as complete, was considered and rejected because it would make percentage completion and the board depend on a UI action rather than actual goal completion.)

### 4.6 API changes ([API_CONTRACTS.md](./API_CONTRACTS.md) §6)

`POST /api/posts` request shape changes:

```text
localDate: today | yesterday
note: optional string
photo: REQUIRED jpeg/png/webp file, max 5 MB   # was optional
goals: JSON array — optional-goal entries only now; required-goal entries are rejected
       (the server derives required state from the day's rollup, not from client input)
clientOperationId: uuid
```

New failure mode: if the date's `metCount < 4` at submit time (e.g. a race with another tab), respond `422 BUSINESS_RULE_VIOLATION` with a code the client maps back to the gate state, rather than partially publishing.

`PostDTO` gains `requiredSnapshot` and `teamId`; the existing `goals` field on `PostDTO` now only ever contains optional-goal entries.

### 4.7 Knock-on effect: achievements

Confirmed acceptable (see §4.2 — Mark-done is meant to let someone log everything at the end of the day), but worth having the full list in one place since it affects four catalog entries, not two ([SCORING_AND_ROLLUPS.md](./SCORING_AND_ROLLUPS.md) §9):

- `FIRST_PHOTO` ("First post with a photo") always unlocks in the same instant as `FIRST_UPDATE`, since every post now has a photo.
- `WORKOUT_READING_ONE_POST` ("One post includes both required goals") is true of every single post, since a post can't exist without all 4 required goals already met.
- `FIRST_FULL_DAY` ("First day with all 4 required goals met") is now reachable at will with four taps (three Mark-done chips + diet), same day one joins.
- `FULL_DAY_AFTER_MISS` ("Complete local day immediately after a closed no-goal day") is likewise reachable on demand rather than being a genuine streak signal.

None of this breaks anything — it's the direct, accepted consequence of Mark-done existing. It does mean these four badges stop signaling anything special once Mark-done ships. Retiring/repurposing them is optional cleanup, not a blocker; still an open call in §6.

### 4.8 Feed backward compatibility (old posts vs. new posts)

Posts published **before** this change and posts published **after** it are shaped differently, and the feed has to render both without special-casing every card:

- **Old post** (published pre-migration): `photoUrl` may be null; `goals` may contain `required` entries (e.g. `{ kind: "required", key: "workout", amount: 45 }`) written the old way, via `post_goal_entries`; `requiredSnapshot` is absent.
- **New post** (published after this ships): `photoUrl` is always present; `goals` contains **only** `optional` entries; `requiredSnapshot` holds the frozen 4-goal recap instead.

Nothing migrates old rows — per §4.4 the `required_goal_key` path on `post_goal_entries` is left alone, not backfilled. The feed card component must therefore render the required-goals recap from **either** source: prefer `requiredSnapshot` when present, otherwise fall back to reading `required` entries out of `goals`, and treat a missing `photoUrl` as "no photo" rather than an error. This is a rendering compatibility rule, not a data migration.

---

## 5. Screens and navigation — diff summary

| Screen | Change |
|---|---|
| Today | + "Mark done" chip per amount goal; + daily nag banner (until posted) |
| Post update sheet | Required-goal section becomes read-only; sheet gates on 4/4 and redirects to Today/Yesterday if not met; photo becomes required |
| Board | + segmented control Individual / Teams; + global `%` header stat |
| Team (new, pushed) | Roster, rank, team `%`, members' individual `%` and today's dots |
| Me | + "My team" block: current team + leave, or join/create |
| Person | + individual `%` |

No new bottom tab. No new top-level route beyond `/(app)/team/:teamId`, which follows the existing pushed-screen pattern (`/(app)/person/:userId`).

---

## 6. Open decisions still owned by you

Everything above is a concrete default so this is buildable as written, but these are genuine product calls worth a second look before implementation starts:

1. **Team % formula** — pooled goal-days (as specced) vs. simple average of members' individual percentages. Pooled is the default here.
2. **Team size / count limits** — none specced. Fine for a small private group; add a cap later if it becomes noisy.
3. **`FIRST_PHOTO` / `WORKOUT_READING_ONE_POST` / `FIRST_FULL_DAY` / `FULL_DAY_AFTER_MISS` achievements** — retire, repurpose, or leave as harmless dead badges (§4.7).
4. **`team_id` denormalization on `posts`** — nice-to-have for feed display continuity; can be dropped from v1 scope without affecting anything else in this document.

None of these block writing the migration or the UI — they're tuning knobs, not missing requirements.

---

## 7. Follow-ups required in the companion subspecs

This document is written to be merge-ready into `MASTER_SPEC.md`'s locked-decision table, but two companion subspecs in the package (see `IMPLEMENTATION_INDEX.md`'s package map) still need matching updates before this is truly implementation-ready.

### `PHASES_AND_ACCEPTANCE.md`

Add a new phase after the existing Phase 8 (Achievements and admin), depending on Phases 3, 4, and 6:

**Phase 8.5 — Teams, percentage completion, mandatory photo**
**Depends on:** Phase 3 (day tracking/Mark-done), Phase 4 (posts/feed), Phase 6 (Board)

Tasks:

- Implement `teams`/`team_memberships`, RLS, and the `/api/teams*` routes (§2).
- Implement Mark-done chips on Today and Yesterday (§4.2).
- Implement the Post sheet's completion gate/redirect and required-photo validation (§4.1, §4.6).
- Implement `requiredSnapshot` capture at publish time and feed rendering of both post shapes (§4.4, §4.8).
- Implement individual/team/global percentage reads (§3) and the Board Teams view/Team screen.

Acceptance:

- A post cannot publish without a photo, for any date, at any time of day.
- Opening Post before 4/4 required goals are met redirects to the tracker instead of rendering a compose form.
- Mark-done tops a goal up to exactly its target and never exceeds it; it's disabled once already met.
- `individualPct`/`teamPct`/`globalPct` match the golden fixtures below and never diverge from a manual recompute of the same window.
- Leaving/joining a team does not change any goal-day's team attribution for dates before the switch.
- A team with 0 active members drops out of `GET /api/teams` and the Teams board on the next read.
- Old (pre-migration) posts still render correctly in the feed alongside new posts.

### `TESTING_AND_OPERATIONS.md`

Golden fixtures to add to §2's table:

| Fixture | Expected result |
|---|---|
| Mark-done on a goal with partial progress | Adds exactly `target - current`, not the full target |
| Mark-done on an already-met goal | No-op, no new delta |
| Post attempted at 3/4 required goals | `422 BUSINESS_RULE_VIOLATION`; client redirected to tracker |
| Post at exactly 4/4 | Publishes; `requiredSnapshot` matches that instant's rollup |
| Member switches team mid-challenge | Goal-days before the switch stay attributed to the old team in `team_pct` |
| Team drops to 0 members | Disappears from `GET /api/teams` and the Teams board; history intact via `get_team_summary` |
| Old post (no `requiredSnapshot`) rendered in feed | Falls back to `goals` required entries without erroring |

RLS subjects to add to §4's per-table matrix: `teams`, `team_memberships` — active member A can read all teams/rosters, can only insert/update their own `team_memberships` row, cannot rename a team they didn't create, cannot force another member's `left_at`; admin can rename any team and force any single member's `left_at`.

Add to §8's observability event list: `team.created`, `team.joined`, `team.left`, `team.renamed`, `post.published` (already present — note it now always carries a photo).
