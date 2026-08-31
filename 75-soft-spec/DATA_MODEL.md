# 75 Soft — Data Model Subspec

**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Related:** [SCORING_AND_ROLLUPS.md](./SCORING_AND_ROLLUPS.md), [AUTH_AND_ACCESS.md](./AUTH_AND_ACCESS.md)

The database is the source of truth. Do not persist totals on profiles or posts when the value can be derived from the append-only logs and published post entries.

## 1. Naming map

| Master spec term | Implementation |
|------------------|----------------|
| User | Supabase `auth.users` + `profiles` |
| Cohort | Singleton `cohorts` row |
| Membership | `memberships` |
| Invite | `invite_codes` |
| WaterContainer | `water_containers` |
| OptionalGoal | `optional_goals` |
| DayDelta | `day_deltas` |
| Update / FeedPost | `posts` + `post_goal_entries` |
| DayRollup | Read view/RPC, not a user-edited table |
| Reaction | `reactions` |
| Comment | `comments` |
| Achievement / UserAchievement | `achievements` + `user_achievements` |
| Admin history | `audit_log` |

## 2. Entity relationships

```text
auth.users 1──1 profiles
cohorts 1──n memberships ──n profiles
cohorts 1──n invite_codes
profiles 1──n water_containers
profiles 1──n optional_goals ──n optional_goal_logs
profiles 1──n day_deltas
profiles 1──n posts 1──n post_goal_entries
posts 1──n reactions
posts 1──n comments
profiles 1──n day_overrides
profiles n──m achievements (via user_achievements)
profiles 1──n audit_log
```

All application UUIDs use `gen_random_uuid()`. All creation instants use `timestamptz` in UTC.

## 3. Core tables

### 3.1 `profiles`

One row per Auth user who has completed app signup.

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | FK to `auth.users.id` |
| `email` | citext | Mirrored verified email; unique |
| `display_name` | text | Required after signup; trimmed |
| `avatar_path` | text nullable | Private Storage object path |
| `timezone` | text | Valid IANA timezone; default captured from signup |
| `reaction_palette` | jsonb | Ordered array of emoji strings |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

The client receives a signed avatar URL, never a permanent public Storage URL.

### 3.2 `cohorts`

The schema can support more than one row, but v1 seeds and enforces one active cohort.

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `name` | text | `75 Soft` |
| `start_date` | date | `2026-09-01` |
| `end_date` | date nullable | Always null in v1 |
| `is_active` | boolean | One active row |
| `created_at` | timestamptz | |

Every membership and group query must use the active cohort; do not let the client select an arbitrary cohort in v1.

### 3.3 `memberships`

Membership is soft-removable so historical authorship and audit references remain valid.

| Column | Type | Rules |
|--------|------|-------|
| `cohort_id` | uuid | FK |
| `user_id` | uuid | FK to `profiles.id` |
| `role` | text | `member` or `admin` |
| `joined_at` | timestamptz | |
| `join_local_date` | date | Date from the user's timezone at acceptance |
| `removed_at` | timestamptz nullable | Null means active |
| `removed_by` | uuid nullable | Admin actor |
| `created_at` | timestamptz | |

Primary key: `(cohort_id, user_id)`. Enforce at most one active admin in application policy unless the operator intentionally grants another admin. A removed user is not an active group member.

### 3.4 `invite_codes`

Only one row may be active for the active cohort.

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `cohort_id` | uuid | FK |
| `code_digest` | text | HMAC or password-style digest |
| `code_ciphertext` | text | Encrypted value for admin display |
| `code_hint` | text | Non-secret display hint |
| `is_active` | boolean | Partial unique index |
| `created_by` | uuid | Admin |
| `created_at` | timestamptz | |
| `rotated_at` | timestamptz nullable | |

Never write the clear code to logs, analytics, audit payloads, or client error responses.

### 3.5 `signup_intents`

Short-lived server state used when email confirmation or OAuth signup separates identity creation from membership completion.

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | Bound to OAuth state or confirmation flow |
| `invite_digest` | text | Does not retain the clear invite |
| `auth_user_id` | uuid nullable | Set after Auth identity exists |
| `email_digest` | text nullable | For matching confirmation |
| `nonce_digest` | text | |
| `expires_at` | timestamptz | Short expiry, for example 15 minutes |
| `consumed_at` | timestamptz nullable | One-time completion |
| `created_at` | timestamptz | |

Expired intents are inaccessible to clients and cleaned up periodically.

### 3.6 `water_containers`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `owner_id` | uuid | FK to profiles |
| `label` | text | Required, trimmed |
| `volume_ml` | integer | Positive |
| `sort_order` | integer | Owner-local ordering |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |
| `deleted_at` | timestamptz nullable | Soft delete protects old display/audit references |

New members receive `Glass` (250 ml) and `Bottle` (500 ml) once. A container tap records the volume at tap time; changing a container later does not rewrite old deltas.

### 3.7 `optional_goals`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `owner_id` | uuid | FK |
| `name` | text | Required |
| `target_value` | numeric nullable | Optional |
| `unit` | text nullable | Required when target is numeric |
| `active` | boolean | Archived goals become inactive |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Optional goals are private to their owner except for data explicitly copied into a published post.

### 3.8 `optional_goal_logs`

Stores quiet optional-goal checkbox/amount actions. These are never included in required rollups.

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `optional_goal_id` | uuid | FK |
| `owner_id` | uuid | Denormalized for RLS |
| `local_date` | date | |
| `value` | numeric nullable | Amount for numeric goals |
| `completed` | boolean nullable | Checkbox state |
| `client_operation_id` | text | Unique per owner for retry safety |
| `created_at` | timestamptz | |

The latest state for a checkbox and the sum/state rules for numeric goals are defined in the optional-goals service, not in required scoring. A checkbox log sets `completed` and leaves `value` null; a numeric log sets `value` and leaves `completed` null.

### 3.9 `day_deltas`

Append-only quiet logs. Each row represents one user action.

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `user_id` | uuid | FK |
| `local_date` | date | User-local date |
| `goal_key` | text | `workout`, `water`, or `reading` for amounts; `diet` for diet events |
| `amount_int` | integer nullable | Minutes, ml, or pages in canonical units |
| `diet_value` | boolean nullable | Required only for `diet` |
| `source` | text | `quiet` |
| `client_operation_id` | text | Unique `(user_id, client_operation_id)` |
| `created_at` | timestamptz | Event order |

Constraints:

- amount events require a positive `amount_int` and a non-diet goal;
- diet events require `diet_value` and no amount;
- the route/RPC validates the canonical unit and editable date;
- rows are never updated to change their meaning.

### 3.10 `posts`

Represents a submitted Post update and its feed item.

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `author_id` | uuid | FK |
| `cohort_id` | uuid | FK |
| `local_date` | date | Today or yesterday at submit time |
| `note` | text nullable | User text |
| `photo_path` | text nullable | Private Storage path |
| `status` | text | `pending`, `published`, `deleted`, or `failed` |
| `client_operation_id` | text | Unique per author for retry safety |
| `created_at` | timestamptz | Feed order |
| `published_at` | timestamptz nullable | |
| `deleted_at` | timestamptz nullable | |
| `deleted_by` | uuid nullable | Author or admin |

Only `published` posts appear in feed or contribute post entries. A soft-deleted post remains available to audit logic but never contributes to a rollup.

### 3.11 `post_goal_entries`

One or more selected goals attached to a post.

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `post_id` | uuid | FK |
| `required_goal_key` | text nullable | One of four required keys |
| `optional_goal_id` | uuid nullable | Owner's optional goal |
| `amount_int` | integer nullable | Canonical amount for amount goals |
| `diet_value` | boolean nullable | `true` for a posted diet goal |
| `optional_value` | numeric nullable | Optional-goal amount |
| `optional_completed` | boolean nullable | Optional-goal checkbox state |
| `created_at` | timestamptz | |

Exactly one of `required_goal_key` and `optional_goal_id` is set. A required amount entry has a positive canonical amount; a required diet entry has `diet_value = true`. An optional numeric entry uses `optional_value` and an optional checkbox entry uses `optional_completed`; exactly one optional value is set. A post may contain several goals but may not contain the same selected goal twice.

### 3.12 `reactions`

| Column | Type | Rules |
|--------|------|-------|
| `post_id` | uuid | FK |
| `user_id` | uuid | FK |
| `emoji` | text | Must be in the reacting user's current palette at write time |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Primary key: `(post_id, user_id)`. Updating a reaction changes the emoji while preserving one reaction per user per post. The stored emoji is not rewritten when the user's palette changes.

### 3.13 `comments`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `post_id` | uuid | FK |
| `author_id` | uuid | FK |
| `body` | text | Trimmed, 1–256 characters |
| `created_at` | timestamptz | |
| `deleted_at` | timestamptz nullable | |
| `deleted_by` | uuid nullable | Author or admin |

Comments are immutable after creation. Deleted comments are omitted from normal feed responses.

### 3.14 `day_overrides`

Admin moderation state for a member/date.

| Column | Type | Rules |
|--------|------|-------|
| `user_id` | uuid | FK |
| `local_date` | date | |
| `kind` | text | `invalidated` |
| `reason` | text nullable | Admin note |
| `created_by` | uuid | Admin |
| `created_at` | timestamptz | |

Primary key: `(user_id, local_date)`. An invalidated day forces all four required challenges to not met and gives that member a daily Board score of 0; it does not delete deltas or posts. Whether an admin can restore an invalidation remains an open product decision.

### 3.15 Achievements

`achievements` is the shared catalog. `user_achievements` records one unlock per member.

| Table | Key fields |
|-------|------------|
| `achievements` | `code`, title, description, `is_hidden`, sort order |
| `user_achievements` | `user_id`, `achievement_id`, `unlocked_at`, optional evidence JSON |

Hidden locked achievements return title/description as `???` until unlocked. The evaluator must be idempotent on `(user_id, achievement_id)`.

### 3.16 `audit_log`

| Column | Type | Rules |
|--------|------|-------|
| `id` | uuid PK | |
| `actor_id` | uuid nullable | Admin or null for a system action |
| `action` | text | Allowlisted action name |
| `target_type` | text | |
| `target_id` | uuid nullable | |
| `metadata` | jsonb | No secrets or full media |
| `created_at` | timestamptz | |

At minimum audit invite rotation, member removal, day invalidation, post deletion by admin, and comment deletion by admin.

## 4. Derived reads

Implement these as SQL views or `security definer` read functions with explicit membership checks:

| Read | Returned information |
|------|----------------------|
| `get_day_rollup(user_id, local_date)` | canonical sums, four met flags, status, editable flag |
| `get_calendar(user_id, from_date, to_date)` | day status/met count for grid |
| `get_group_strip(viewer_id)` | active member identity, four dots, current-local-day achieved count and score date |
| `get_person_summary(viewer_id, subject_id)` | profile, current-day count, grid, achievements, posts |
| `get_board(viewer_id)` | active members ranked by current-local-day achieved count |
| `get_feed_page(viewer_id, cursor, limit)` | published posts, author, entries, counts, comments |

Raw amount/diet events are not exposed to other members. The group UI receives the minimum aggregate fields it needs.

## 5. Indexes and uniqueness

Required indexes:

- `memberships (cohort_id, removed_at, user_id)`;
- `memberships (user_id, joined_at)`;
- `day_deltas (user_id, local_date, created_at)`;
- unique `day_deltas (user_id, client_operation_id)`;
- `posts (cohort_id, status, created_at desc)`;
- `posts (author_id, local_date, created_at desc)`;
- unique `posts (author_id, client_operation_id)`;
- `post_goal_entries (post_id)`;
- unique `post_goal_entries (post_id, required_goal_key)` where `required_goal_key` is not null;
- unique `post_goal_entries (post_id, optional_goal_id)` where `optional_goal_id` is not null;
- `comments (post_id, created_at)`;
- `reactions (post_id)`;
- unique active invite per cohort;
- `user_achievements (user_id, achievement_id)`;
- `audit_log (created_at desc)`.

## 6. RLS summary

| Table | Select | Insert/update/delete |
|-------|--------|----------------------|
| `profiles` | Active members see active member profiles; own row during completion | Own profile only |
| `memberships` | Own membership; active members' basic active membership rows; admin all | System/admin only |
| `invite_codes` | Admin only | Admin only |
| `water_containers` | Owner only | Owner, editable container |
| `optional_goals`, `optional_goal_logs` | Owner only | Owner |
| `day_deltas` | Owner/admin troubleshooting only | Owner through validated RPC |
| `posts` | Active members see published group posts | Owner creates/deletes own; admin deletes |
| `post_goal_entries` | Same visibility as parent post | Parent author through post transaction |
| `comments`, `reactions` | Active members on published posts | Active member creates own; author/admin deletes comment; owner updates own reaction |
| `day_overrides` | Aggregated through read RPC; admin raw access | Admin only |
| `achievements` | Active members | Seed/system only |
| `user_achievements` | Active members may see achievement state on Person; owner/admin raw access | System only |
| `audit_log` | Admin only | Server/admin only |

RLS policies must call stable helper functions such as `is_active_member(auth.uid())` and `is_admin(auth.uid())`. Avoid policy recursion by keeping helpers in a protected schema or using carefully scoped `security definer` functions.

## 7. Storage

Use a private `post-photos` bucket. Object path:

```text
posts/{author_id}/{post_id}/{random_id}.{jpeg|png|webp}
```

The server checks ownership and active membership before upload, signed URL creation, or deletion. Photo deletion is part of post deletion's cleanup path. The bucket must not be public.

## 8. Seed data

Initial migration/seed must create:

- one active `75 Soft` cohort with start date `2026-09-01`;
- the four required goal definitions/config constants;
- the default reaction palette;
- `Glass` 250 ml and `Bottle` 500 ml for each newly completed member;
- fixed and hidden achievement catalog rows;
- the operator's admin membership through a documented manual step;
- one active invite through a secure manual/admin step, not a committed code.

