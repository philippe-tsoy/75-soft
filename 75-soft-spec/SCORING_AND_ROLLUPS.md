# 75 Soft — Scoring and Rollups Subspec

**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Related:** [DATA_MODEL.md](./DATA_MODEL.md), [API_CONTRACTS.md](./API_CONTRACTS.md)

This document defines the authoritative calculations. The UI may preview a result, but the server response and database functions decide what counts.

## 1. Canonical units

Store and calculate required amounts as integers:

| Goal | Stored unit | Target |
|------|-------------|--------|
| Workout | minutes | 45 |
| Water | milliliters | 2,000 |
| Reading | pages | 10 |
| Diet | latest boolean state | met/unset |

Convert liters to milliliters at the input boundary. Do not use floating-point values for water scoring.

## 2. Date and cohort functions

Every function accepts a user's IANA timezone and operates on local calendar dates.

```text
member_local_today(user) = calendar date of now() in user.timezone
day_number(date) = date - 2026-09-01 + 1
```

Day N is never calculated from elapsed hours. The shared cohort date is the same calendar sequence for everyone; whether a day is open, closed, or editable is evaluated in the member's local timezone. Calendar weeks may be used to group grid cells, but are not scored.

For each member, persist `join_local_date` when membership is activated. A later timezone change does not rewrite it or relabel old records.

## 3. Source events

### Required amounts

For `(user_id, local_date)`:

```text
workout_minutes =
  sum(day_deltas.amount_int where goal_key = workout)
  + sum(published post_goal_entries.amount_int where required_goal_key = workout)

water_ml =
  sum(day_deltas.amount_int where goal_key = water)
  + sum(published post_goal_entries.amount_int where required_goal_key = water)

reading_pages =
  sum(day_deltas.amount_int where goal_key = reading)
  + sum(published post_goal_entries.amount_int where required_goal_key = reading)
```

Pending, failed, and deleted posts do not contribute. A container tap contributes the container's current volume at the time of the tap; later container edits do not alter that event.

### Diet

Diet is a state, not a sum:

1. A quiet diet tap reads the current derived state in a transaction.
2. It appends the inverse state (`true` → `false`, `false` → `true`) to `day_deltas`.
3. A published post containing diet appends a `true` event through its post entry.
4. The current state is the latest active diet event ordered by event time and deterministic id.
5. Deleted posts are excluded, so the prior active event becomes effective.
6. No event means unset/not met.

This gives the second quiet tap its required unset behavior while making post deletion recalculate deterministically.

## 4. Goal and day status

```text
goal_met(day, workout) = workout_minutes >= 45
goal_met(day, water)   = water_ml >= 2000
goal_met(day, reading) = reading_pages >= 10
goal_met(day, diet)    = diet_state == true
met_count              = count(goal_met == true)
```

An admin invalidation masks all four goal flags and sets `met_count = 0`; if the date is the member's current local date, the daily Board score is also 0. Raw source events remain for audit and post visibility.

### Status derivation

```text
if date < 2026-09-01 or date < join_local_date:
  unscored
else if date > local_today:
  future
else if date == local_today:
  complete       if met_count == 4
  in_progress    if met_count > 0 and met_count < 4
  open           if met_count == 0
else:
  complete       if met_count == 4
  partial        if 1 <= met_count <= 3
  missed         if met_count == 0
```

`future` and `open` are implementation display states, not new scored outcomes in the product vocabulary. The UI must show an open zero-goal today as neutral/not started, never as a failure. A closed zero-goal day is `missed`.

`editable = active member AND date in {local_today, local_today - 1} AND date >= cohort start AND date >= join_local_date AND not invalidated`.

## 5. Daily leaderboard score

The Board evaluates only the four required challenges on each member's current local date:

```text
board_date(user) = member_local_today(user)

board_eligible(user) =
  board_date(user) >= 2026-09-01
  AND board_date(user) >= user.join_local_date
  AND user is an active member

goals_achieved_today(user) =
  count of required_keys where goal_met(user, board_date(user), key)
  if board_eligible
```

The score is not cumulative. At the member's local midnight, the previous score ends and the new date starts at zero. Members in different timezones can therefore be on different local dates at the same instant; each row uses that member's own local date.

There is no weekly score, threshold, pass/fail bar, or aggregate daily pass/fail score. A calendar cell may show descriptive progress state for orientation, while each required challenge remains independently met or not met.

## 6. Group strip and calendar reads

### Group strip

For every active member, return:

```text
{
  user,
  localDate,
  dayNumber,
  goalDots: { workout, water, reading, diet },
  goalsAchievedToday,
  scoreDate
}
```

The member's own timezone determines `scoreDate` and the four dots. The viewer's timezone is used only for feed timestamp formatting.

### Calendar grid

Return one cell per requested local date with:

```text
{
  localDate,
  dayNumber,
  status,
  metCount,
  editable,
  invalidated
}
```

Pre-join and pre-start cells are blank/unscored. Future cells are visually distinct. The grid is view-only for dates older than yesterday even if an admin can still invalidate a day.

## 7. Leaderboard and ties

Return active members ordered by `goals_achieved_today DESC`. No secondary sort may decide a tie.

Use competition ranking (`RANK()`: `1, 1, 3`). Same-count members share a rank, and the next rank includes the number of rows tied above it.

Each entry includes:

```text
{
  rank,
  user,
  goalsAchievedToday,
  scoreDate
}
```

Do not use prior-day count, complete-day count, streak, join date, or name as a hidden tie-breaker.

## 8. Mutation and consistency rules

### Amount additions

- Every user tap gets a client operation id.
- The database enforces uniqueness of `(user_id, client_operation_id)`.
- Retrying the same request returns the existing delta and fresh rollup.
- A new tap gets a new operation id even if it has the same amount.
- The insert and rollup read occur in one transaction where practical.

### Diet toggle

The toggle function locks the user's date state, derives the current state, and appends the inverse. Two concurrent taps therefore produce two ordered toggles instead of lost updates.

### Post creation/deletion

Post amounts are entries in the same rollup source set as quiet amounts. Deleting a post changes the derived totals immediately; no manual aggregate repair is allowed. Feed rows are filtered by `status = published`, while soft-deleted rows remain available for audit and cleanup.

### Admin invalidation

Invalidation writes one `(user_id, local_date)` override and is idempotent. It:

- forces the four scoring flags false;
- makes the date non-editable to the member;
- leaves raw deltas and posts visible to permitted viewers;
- recalculates the affected day and current daily leaderboard reads;
- records actor, target, date, reason, and timestamp in `audit_log`.

Whether an admin can restore an invalidation remains an open product decision.

## 9. Achievements

Achievement evaluation is idempotent and returns at most one display toast per user action. If several achievements unlock together, persist all of them and return a deterministic priority-ordered list; the client renders only the first toast.

### Fixed catalog

| Code | Trigger |
|------|---------|
| `FIRST_UPDATE` | First published Post update |
| `FIRST_FULL_DAY` | First uninvalidated day with all four required goals met |
| `FIRST_PHOTO` | First published post with a photo |
| `DAY_75` | Cohort reaches Day 75 and the user is an active member |

### Initial hidden catalog

The master spec describes these as examples. To make v1 testable, seed the following exact rules and keep the catalog extensible:

| Code | Trigger |
|------|---------|
| `THREE_POSTS_ONE_DAY` | Three published posts by the user on one local date |
| `WATER_BEFORE_NOON` | User first reaches 2,000 ml before 12:00 in their timezone |
| `FULL_DAY_AFTER_MISS` | Complete local day immediately after a closed no-goal day |
| `WORKOUT_READING_ONE_POST` | One post includes both required goals |
| `SEVEN_PHOTOS` | Seven published posts with photos |
| `WATER_EXACT_TARGET` | A rollup reaches exactly 2,000 ml |

Locked hidden achievements are returned as `???` until the user unlocks them. Achievement unlocks are monotonic in v1: later moderation does not silently revoke a badge already shown, although invalidated data cannot create a new unlock.

`DAY_75` may be evaluated lazily when an active member loads Today or performs an action on/after Day 75; it does not require a notification system. Optional-goal streak toasts are owner-only UI events and never enter the achievement catalog or daily leaderboard.

## 10. Calculation examples

### First cohort day

2026-09-01 is Day 1 for every member. An active member with three met required challenges has a daily Board score of 3.

### Late joiner

If a member joins on Sep 4, Sep 1–3 are unscored. Their first eligible local day starts with a daily Board score of 0; there is no retroactive or cumulative penalty.

### Local midnight

When a member's local date changes, the previous daily Board score ends and the new date starts at 0. Required-challenge states for the previous date remain available in the calendar as history.

