# 75 Soft

Product spec for the private group tracker. Full rules: [MASTER_SPEC.md](./MASTER_SPEC.md).

---

## Implementation subspecs

The implementation package turns the product rules into technical contracts and delivery slices:

- [Implementation index](./IMPLEMENTATION_INDEX.md)
- [Common implementation contract](./COMMON_IMPLEMENTATION.md)
- [Parallel workstreams](./PARALLEL_WORKSTREAMS.md)
- [Architecture](./ARCHITECTURE.md)
- [Authentication and access](./AUTH_AND_ACCESS.md)
- [Data model](./DATA_MODEL.md)
- [Scoring and rollups](./SCORING_AND_ROLLUPS.md)
- [API contracts](./API_CONTRACTS.md)
- [UI and navigation](./UI_AND_NAVIGATION.md)
- [Phases and acceptance](./PHASES_AND_ACCEPTANCE.md)
- [Testing and operations](./TESTING_AND_OPERATIONS.md)
- [Implementation review](./IMPLEMENTATION_REVIEW.md)

The master spec remains the product source of truth; the implementation package must not silently change its locked decisions.

---

## Pages

Mobile-first. **Three bottom tabs.** No Rules, Calendar, or Notifications tab. Compose and water-container CRUD are **sheets**, not tabs.

### Chrome

| Element | What it is |
|---------|------------|
| Bottom tabs | **Today** · **Feed** · **Board** |
| Header avatar | Opens **Me** |
| Header (optional) | **75 Soft** + Day N on Today |

```text
[ Signup / Login ]  (no tabs)

Today                Feed                 Board
  ├ group dots         └ Person             └ Person
  ├ my week/month grid
  ├ Yesterday (same page, date switch)
  ├ Water containers (sheet)
  └ Post update (sheet)

Me (from avatar)
  ├ Person (own public view + Edit)
  ├ Optional goals
  ├ Reaction palette
  ├ Logout / password
  └ Admin (you only)
       └ Member list → invalidate day / remove
```

### Auth (no tabs)

- **Invite** — reusable group code, or link with code prefilled
- **Signup** — email + password → name + photo
- **Login** — email + password
- **Forgot password** — from Login

After signup → **Today**.

### Today (tab, home)

Logging first. **75 Soft**, date, Day N. Group row (everyone’s 4 dots + today’s achieved-challenge count). **Your grid** (week/month heatmap). Workout / water containers / reading chips. Diet button. Optional goals. **Post update**. **Yesterday** (same layout). Quiet taps stay here.

### Feed (tab)

Group **Post update**s only. React, comment (≤256). Tap author → Person. Photo lightbox. Empty: “No posts yet.”

### Board (tab)

Ranked by goals-achieved **count**. Ties share a place. Tap row → Person.

### Person (push)

Photo, name, today’s achieved-challenge count, their grid, achievements, their posts. If you: **Edit** → Me.

### Me (avatar)

Name, photo, own Person, optional goals, reaction palette, logout, password. **Admin** only for you.

### Sheets

- **Post update** — goals, amounts, note, photo (5 MB)
- **Water containers** — member-created label + ml; no default containers
- **Yesterday** — Today’s tracker, date = yesterday only

### Admin (you)

Reusable code + link, rotate, member list, invalidate a day, remove member, delete a post.

### Not pages

Rules, onboarding, notifications, chat, Calendar tab, achievement gallery, water as a tab.
