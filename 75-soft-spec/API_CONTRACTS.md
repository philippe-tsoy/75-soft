# 75 Soft — API Contracts Subspec

**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md), [SCORING_AND_ROLLUPS.md](./SCORING_AND_ROLLUPS.md)

All application routes live under `/api`. Supabase session cookies authenticate browser requests. A route derives the actor from the session; client-supplied actor ids are ignored.

## 1. Standard response and errors

Successful JSON responses use a stable top-level shape:

```json
{ "data": {} }
```

Paginated responses use:

```json
{
  "data": [],
  "nextCursor": "opaque-cursor-or-null"
}
```

Errors use:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Human-readable message",
    "details": {}
  }
}
```

The client may display `message`, but must branch on the stable `code`.

| HTTP | Codes and meaning |
|------|-------------------|
| 400 | `VALIDATION_ERROR`, malformed JSON or query |
| 401 | `AUTH_REQUIRED`, expired/absent session |
| 403 | `FORBIDDEN`, not an active member or not an admin |
| 404 | `NOT_FOUND`, resource is not visible to the actor |
| 409 | `CONFLICT`, duplicate operation, identity conflict, or stale state |
| 413 | `PAYLOAD_TOO_LARGE`, photo over 5 MB |
| 415 | `UNSUPPORTED_MEDIA_TYPE`, photo format not jpeg/png/webp |
| 422 | `BUSINESS_RULE_VIOLATION`, locked date or invalid goal operation |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR`, with no secret details |

## 2. Session and auth

### `POST /api/invite/validate`

Validates the reusable code and creates a short-lived server-side signup intent.

**Body**

```json
{ "code": "REUSABLE-CODE" }
```

**Response `200`**

```json
{
  "data": {
    "valid": true,
    "intentExpiresAt": "2026-08-31T00:45:00Z"
  }
}
```

An invalid code returns `200` with `valid: false` and no intent cookie. The message remains generic and must not reveal whether a code was previously valid.

### `POST /api/auth/signup`

Creates an email/password identity and completes or starts invite-backed membership. Use `multipart/form-data` when an avatar is included.

**Fields**

```text
email: string
password: string
displayName: string
timezone: IANA timezone
avatar: jpeg|png|webp file
```

The server reads the signed invite intent, not a trusted hidden form field. The response is `201` with a completed session or `202` when email confirmation is required:

```json
{
  "data": {
    "state": "active" | "awaiting_email_confirmation",
    "user": "ProfileDTO | null"
  }
}
```

### `GET /api/auth/session`

**Response `200`**

```json
{
  "data": {
    "authenticated": true,
    "member": true,
    "user": "ProfileDTO",
    "role": "member" | "admin"
  }
}
```

An unauthenticated response is `200` with `authenticated: false`, not an error, so the public shell can bootstrap.

### `POST /api/auth/logout`

Clears the application session. **Response:** `204`.

### `POST /api/auth/password-reset`

**Body:** `{ "email": "user@example.com" }`  
**Response:** `202` with a generic message regardless of account existence.

OAuth start/callback routes use Supabase's supported Google flow and the invite intent described in [AUTH_AND_ACCESS.md](./AUTH_AND_ACCESS.md). They are browser routes rather than JSON APIs.

## 3. Profile and member reads

### `GET /api/profile`

Returns the current member's profile, role, timezone, palette, and signed avatar URL.

### `PATCH /api/profile`

Accepts JSON for name/timezone or multipart for a new avatar:

```json
{
  "displayName": "Alex",
  "timezone": "America/New_York"
}
```

**Response:** `{ "data": { "profile": "ProfileDTO" } }`

### `GET /api/profiles/:userId`

Returns a Person view only when the requester is an active member.

**Response**

```json
{
  "data": {
    "profile": "ProfileDTO",
    "goalsAchievedToday": 3,
    "calendar": "CalendarCellDTO[]",
    "currentDay": "DayRollupDTO",
    "achievements": "AchievementDTO[]",
    "posts": "PostDTO[]"
  }
}
```

The current user's Person view includes an edit link in UI data; other people's responses do not expose profile-edit capabilities.

## 4. Day tracking

### `GET /api/day/:localDate`

Returns the current user's rollup for an ISO date. Today and yesterday are editable when eligible; older dates are view-only. The route may return old dates for the user's calendar.

**Response**

```json
{
  "data": {
    "localDate": "2026-09-01",
    "dayNumber": 1,
    "status": "unscored" | "future" | "open" | "in_progress" | "partial" | "complete" | "missed",
    "editable": true,
    "invalidated": false,
    "goals": {
      "workout": { "amount": 15, "target": 45, "met": false, "unit": "minutes" },
      "water": { "amount": 500, "target": 2000, "met": false, "unit": "ml" },
      "reading": { "amount": 5, "target": 10, "met": false, "unit": "pages" },
      "diet": { "met": false }
    },
    "metCount": 0
  }
}
```

### `POST /api/day/:localDate/entries`

Adds one amount to workout, water, or reading. The server derives actor, timezone eligibility, and canonical amount.

**Workout example**

```json
{
  "goal": "workout",
  "amount": 15,
  "clientOperationId": "uuid"
}
```

**Water container example**

```json
{
  "goal": "water",
  "containerId": "uuid",
  "clientOperationId": "uuid"
}
```

**Custom water example**

```json
{
  "goal": "water",
  "amount": 0.5,
  "unit": "l",
  "clientOperationId": "uuid"
}
```

Reading uses `unit: "pages"` or omits the unit. Water is normalized to ml; workout and reading amounts must be positive integers.

**Response `201` or idempotent `200`**

```json
{
  "data": {
    "day": "DayRollupDTO",
    "deltaId": "uuid",
    "newAchievements": "AchievementDTO[]"
  }
}
```

### `POST /api/day/:localDate/diet/toggle`

Body: `{ "clientOperationId": "uuid" }`  
The server atomically derives the current state and appends its inverse. Reusing the operation id returns the original result. **Response:** same day mutation envelope.

### `GET /api/group/today`

Returns the current user's Today header, shared Day N, and group strip. Each member's dots and daily achieved count are calculated for that member's current local date.

## 5. Water containers

### `GET /api/containers`

Returns the current user's non-deleted containers ordered by `sortOrder`.

### `POST /api/containers`

**Body**

```json
{ "label": "Travel mug", "volumeMl": 350 }
```

### `PATCH /api/containers/:id`

Accepts `{ "label"?, "volumeMl"?, "sortOrder"? }`. Existing deltas retain their original volume.

### `DELETE /api/containers/:id`

Soft-deletes the owner's container. **Response:** `204`. At least one active container is not required; +250 ml and custom entry remain available.

## 6. Post updates and feed

### `POST /api/posts`

Accepts `multipart/form-data`:

```text
localDate: today | yesterday | ISO date (server validates exact date)
goals: JSON array of PostGoalInput
note: optional string
photo: optional jpeg/png/webp file, max 5 MB
clientOperationId: uuid
```

`PostGoalInput` examples:

```json
[
  { "kind": "required", "key": "workout", "amount": 30 },
  { "kind": "required", "key": "water", "containerId": "uuid" },
  { "kind": "required", "key": "diet" },
  { "kind": "optional", "optionalGoalId": "uuid", "completed": true }
]
```

At least one goal is required. Required amount inputs use the same chips/custom conversions as Today. Optional-goal-only posts are valid. An optional numeric goal uses `value`; an optional checkbox goal uses `completed`. The server verifies every optional goal belongs to the actor and every container belongs to the actor.

The submitted date is an assertion from the client, not an authority. The server derives the actor's current local date from the stored timezone and accepts only that date or the immediately previous local date.

**Response `201`**

```json
{
  "data": {
    "post": "PostDTO",
    "day": "DayRollupDTO",
    "newAchievements": "AchievementDTO[]"
  }
}
```

Only published posts are returned. A retry with the same operation id returns the existing post instead of adding amounts a second time.

### `GET /api/feed?cursor=<cursor>&limit=20`

Returns group posts newest first. `limit` defaults to 20 and is clamped to a safe maximum of 50.

```json
{
  "data": ["PostDTO"],
  "nextCursor": "opaque-or-null"
}
```

The cursor must be based on `(created_at, id)`, not an offset, so new posts do not duplicate or skip existing results.

### `GET /api/posts/:id`

Returns one visible post, its selected goals/amounts, reaction summary, comments, and a short-lived signed photo URL if present.

### `DELETE /api/posts/:id`

Author or admin only. Soft-deletes the post, removes it from feed, excludes its entries from rollups, and queues Storage photo cleanup. The response includes affected day data when the actor is allowed to see it.

## 7. Reactions and comments

### `PUT /api/posts/:id/reaction`

**Body:** `{ "emoji": "🔥" }`  
The server checks the emoji against the current user's palette and upserts the one reaction for that user/post.

### `DELETE /api/posts/:id/reaction`

Removes the current user's reaction. **Response:** `204`.

### `POST /api/posts/:id/comments`

**Body:** `{ "body": "Nice work!" }`  
Trim, count characters correctly, and reject an empty or over-256-character body. **Response:** `{ "data": { "comment": "CommentDTO" } }`.

### `DELETE /api/comments/:id`

Comment author or admin only. Comments cannot be edited. **Response:** `204`.

## 8. Reaction palette

### `GET /api/profile/reactions`

Returns the current user's ordered palette.

### `PUT /api/profile/reactions`

**Body**

```json
{ "emoji": ["👍", "🔥", "😂", "❤️", "💪"] }
```

The server validates Unicode emoji entries and applies a safe configured palette-size limit. A reaction already stored on a post is not rewritten when the palette changes.

## 9. Optional goals

### `GET /api/optional-goals`

Returns only the current user's active and archived optional goals.

### `POST /api/optional-goals`

**Body**

```json
{
  "name": "Meditate",
  "targetValue": 10,
  "unit": "minutes"
}
```

`targetValue` and `unit` are both optional; a numeric target requires a unit.

### `PATCH /api/optional-goals/:id`

Updates name/target/unit or sets `active: false`. Ownership is required.

### `POST /api/optional-goals/:id/log`

**Body**

```json
{
  "localDate": "2026-09-01",
  "value": 10,
  "completed": true,
  "clientOperationId": "uuid"
}
```

The date must be today or yesterday in the actor's timezone. The response may include an owner-only optional-goal streak toast; it never changes required scoring or the board.

## 10. Board and achievements

### `GET /api/board`

Returns active members ordered by the current local day's required challenges achieved, with same-count ties sharing a competition rank. Each row includes the member's score date. No query parameter can choose another ranking metric in v1.

### `GET /api/profiles/:userId/achievements`

Returns the fixed catalog and the subject's unlocked state. Locked hidden entries are represented as `???`.

## 11. Admin

All admin routes perform a fresh database role check and write an audit row.

### `GET /api/admin/invite`

Returns the current active invite for admin display, including a copyable invite link. Never include historical codes.

### `POST /api/admin/invite/rotate`

Generates and activates a new reusable code, invalidates the old code, and returns the new clear code once in the admin response.

### `GET /api/admin/members`

Returns active members and sufficient state for moderation. Do not expose private optional goals or raw day events.

### `POST /api/admin/members/:userId/invalidate-day`

**Body**

```json
{ "localDate": "2026-09-01", "reason": "Manual moderation reason" }
```

Creates an idempotent invalidation override. Posts remain visible; all four required challenges become not met and the affected daily Board score becomes 0.

### `POST /api/admin/members/:userId/remove`

Soft-removes the member and blocks future access. The response does not delete historical posts automatically.

### `DELETE /api/admin/posts/:postId`

Admin post deletion; same recalculation and photo cleanup as author deletion.

## 12. DTO conventions

Dates and IDs are strings. Instants are ISO 8601 UTC strings. Response DTOs use camelCase.

| DTO | Required fields |
|-----|-----------------|
| `ProfileDTO` | `id`, `displayName`, `avatarUrl`, `timezone` only where appropriate |
| `DayRollupDTO` | `localDate`, `dayNumber`, `status`, `editable`, `invalidated`, four goal states, `metCount` |
| `DailyBoardDTO` | `scoreDate`, `goalsAchievedToday`, four required-challenge states |
| `PostDTO` | `id`, `author`, `localDate`, `createdAt`, selected goals/amounts, note, photoUrl, reaction summary, comments |
| `CommentDTO` | `id`, `author`, `body`, `createdAt`, `canDelete` |
| `AchievementDTO` | `code`, `title`, `description`, `isHidden`, `unlockedAt` |
| `BoardEntryDTO` | `rank`, `user`, `goalsAchievedToday`, `scoreDate` |

## 13. Mutation invalidation map

| Mutation | Invalidate/refetch |
|----------|-------------------|
| Amount/diet log | day, group strip, board, Person, achievements |
| Container change | containers; day only after a tap uses a container |
| Post create/delete | day, group strip, board, Person, feed, post, achievements |
| Reaction | post/feed page only |
| Comment | post/feed page only |
| Profile update | session, profile, group strip, board, Person, feed author cards |
| Optional-goal log | optional goals and owner-only toast state |
| Admin invalidation | affected day, group strip, board, Person, achievements display |
| Member removal | group strip, board, admin members, session/access |

