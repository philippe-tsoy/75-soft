# MASTER_SPEC — 75 Soft

**Version:** 0.9  
**Status:** Draft for review  
**Product name:** 75 Soft

Tracking app for a small private group. No onboarding lecture. People who join already know the challenge.

**Cohort start:** 1 September 2026. Shared calendar for everyone.

---

## 1. Product

A mobile-first app to log daily Soft goals, see everyone else's progress, and rank people by how many required goals they have met.

Home is **today's tracker**. Quick taps add amounts. **Post update** is optional and is what appears on the feed.

### Principles

1. Log in as few taps as possible
2. Everyone in the group sees everyone else's progress
3. A miss does not restart anything and does not add days
4. Optional personal goals never affect the leaderboard
5. No challenge explainer, FAQ, marketing copy, or notifications

### Not in scope

- Calorie / macro tracking
- Workout programming
- Weight or body metrics
- Public signup / public social network
- Push, SMS, email, or in-app notification center
- Restart-from-day-1 rules
- Personal end dates or miss-based extensions

---

## 2. Group and access

One shared cohort. Everyone who is in can see:

- Everyone's tracker progress
- The shared feed
- The shared leaderboard

No public profiles outside the group.

Roles: **member** and **admin**.

**First admin** is you (the operator). Seeded by hand. You create the reusable group invite.

### Invite

No invite → no account. Signup is not reachable without a valid code.

**One reusable group code** (and the same code in a link). It does not burn after one use. You can rotate it if it leaks.

| Method | Behavior |
|--------|----------|
| **Invite link** | URL contains the code. Opens signup already valid. |
| **Invite code** | User taps sign up and **types the code**. Wrong code: stay on that step. |

### Login

After the account exists, sign in with email and password. A verified email maps to one account.

| Method | Behavior |
|--------|----------|
| **Email + password** | Email and password. Forgot-password via email reset. |

### Profile

On signup **and** later from profile:

- **Display name**
- **Profile picture** (camera or upload)

Name and photo show on the feed, tracker, and leaderboard.

---

## 3. Time

- Each user uses **their own local timezone** (device). If it changes, they deal with it.
- A Soft day is midnight–midnight in that user's timezone.
- Leaderboard and feed show timestamps in the **viewer's** timezone.
- Calendar weeks may be used for display, but they do not produce a score or pass/fail result.

---

## 4. Shared cohort calendar

| Rule | Detail |
|------|--------|
| Start | **2026-09-01** for everyone |
| End date | **None.** No cap. The group does not close. |
| Day N | Sept 1 = Day 1, Sept 2 = Day 2, … After Day 75 this becomes Day 76, 77, … |
| After Day 75 | App keeps running. The daily leaderboard and feed continue; there is no weekly bar. |
| Late join | Same Day N as everyone. No personal 75-day clock. |

Days **before** a member's join date are **unscored** (not a miss). From join date onward they are on the shared calendar.

A **fully missed day** = local day ended with **none** of the 4 required goals met. It displays as **0/4** required challenges met; it is not an aggregate daily pass/fail.

No restart. No end-date pushback.

**Edit window:** only **today** and **yesterday** (previous local day). Older days are locked (admin invalidate/delete still allowed).

---

## 5. Required daily goals

Four official goals. Each is an independent met/not-met challenge. Only these count toward the daily leaderboard; there is no aggregate daily or weekly pass/fail.

| Goal key | Label | Daily target |
|----------|-------|----------------|
| `workout` | Workout | 45 minutes |
| `water` | Water | 2.0 liters |
| `reading` | Reading | 10 pages of a book |
| `diet` | Ate well & drank only socially | Self-attested. One goal. |

All four are **met / not met** for the day. Amounts **sum** across taps that day.

Honesty is self-attested.

### Workout (Today)

- Progress: `minutes / 45`
- Chips: **+15**, **+30**, **+45**
- Custom: type minutes, add
- One tap on a chip is enough
- Quiet (not a feed post)

### Water (Today)

In-app water tracker.

**Saved containers** (per user):

- Each container: **label** + **volume** (ml)
- User can add, rename, change volume, delete
- No default containers; members add their own
- **One tap** on a container adds that volume to today's water
- Long-press / edit icon to change a container

Also:

- Chip: **+250 ml**
- Custom: type ml or L, add

Progress: liters (e.g. `1.25 / 2.0 L`). Met at ≥ 2.0 L.

Container taps and chips are **quiet**.

### Reading (Today)

- Progress: `pages / 10`
- Chips: **+5**, **+10**
- Custom: type pages, add
- Quiet

### Diet (Today)

- **Button:** 1 tap = met, 2nd tap = unset
- Not automatic
- Quiet

Diet can also be included as a chip inside **Post update**.

### Yesterday

User can open **yesterday** only (not older).

On yesterday they can: tap diet, add workout/water/reading amounts (same chips / containers), unset diet, delete yesterday's feed posts.

They cannot edit Day N−2 or earlier.

---

## 6. Optional personal goals

A user can add **one or more** optional goals for themselves.

| Rule | Detail |
|------|--------|
| Who sees the list | Only the owner. If they include one in a **Post update**, that post can show it. Still never scored. |
| Leaderboard / aggregate pass-fail | **Never counted** |
| Shape | Name, optional daily target (checkbox or number + unit), active flag |

Quiet taps on an optional checkbox/amount on Today do not go to the feed unless they **Post update**.

---

## 7. Quiet log vs Post update

Two ways to change the day:

| Action | Counts for tracker / board | Feed |
|--------|----------------------------|------|
| Diet button, water container, amount chips, custom add | Yes | **No** |
| **Post update** (compose sheet) | Yes | **Yes** |

**Post update** compose:

1. Select one or more goals (required and/or optional)
2. Fill amounts if needed (same chips / containers / custom)
3. Optional note
4. Optional photo
5. Post → feed item

Allowed: several goals in one post; several posts a day; amounts still **add**.

Optional-goals-only post is allowed on the feed; does not score.

### Photo (on Post update only)

- **Take photo** (camera). Desktop: upload if no camera.
- **Upload** from library

One photo per post. Visible on the feed.

| Constraint | Value |
|------------|--------|
| Formats | jpeg, png, webp |
| Max upload | **5 MB** |

---

## 8. Tracker (home)

### Today (self)

- Product title **75 Soft**, shared **Day N**, local date
- Workout chips + custom
- Water: container row + +250 ml + custom + manage containers
- Reading chips + custom
- Diet button
- Optional goals
- **Post update**
- Switch / link to **Yesterday** (only)

### Group tracker

Everyone sees everyone else's **today** required-goal dots and today's achieved-goal count.

Tapping a person opens their calendar (required goals) and their feed posts.

Late joiners: pre-join days blank, not misses.

---

## 9. Challenge outcomes

The four required tracks are the challenges being evaluated:

| Challenge | Outcome |
|-----------|---------|
| Workout | Met when workout minutes are at least 45 |
| Water | Met when water reaches at least 2.0 liters |
| Reading | Met when reading reaches at least 10 pages |
| Diet | Met when the user self-attests it |

Each challenge is independently met or not met. There is no weekly pass/fail and no aggregate daily pass/fail. The day may show progress such as `3/4` for orientation, but that display is not a pass/fail result.

Calendar weeks remain available as date groupings if useful for the grid, but no threshold, weekly bar, weekly denominator, or weekly leaderboard is calculated.

---

## 10. Daily leaderboard

**Rank:** `goals_achieved_today` = count of the four required challenges met on that member's current local date. Higher count wins. Same count = **same rank** using competition ranking (`1, 1, 3`). No other tie-break.

The score resets when that member's local date changes at midnight. It never carries a prior day's score forward. A member in a different timezone may therefore be on a different local date; each row uses the member's own local date.

Before the cohort start or before a member joins, the member is not eligible for a scored row. After joining, an empty current day has a score of 0.

---

## 11. Feed

Single feed. Whole group. Reverse chronological.

Only **Post update** creates a feed item. Quiet taps do not.

Each item: author (name + photo), time, selected goals and amounts, note, photo.

### Reactions

Default palette (shipped): 👍 🔥 😂 ❤️ 💪

Each user can **change their own palette** to any emoji they want (add/remove/replace). When they react, they pick from **their** palette. Everyone sees the emoji they sent.

One reaction per user per post (changeable).

### Comments

Max **256** characters. No edit after post. Author or admin can delete.

Author or admin can delete a post. Delete **recalculates** that day's sums (and yesterday's, if it was a yesterday post).

No notifications.

---

## 12. Achievements

Same list for everyone. Locked = "???".

### Fixed

| Code | When |
|------|------|
| `FIRST_UPDATE` | First **Post update** (quiet taps do not count) |
| `FIRST_FULL_DAY` | First day with all 4 required goals met |
| `FIRST_PHOTO` | First post with a photo |
| `DAY_75` | Shared calendar reaches **Day 75** and the user is a member |

Day 75 is a badge only. Group continues.

### Hidden (same list for all)

Examples: 3 posts in one day; water before noon; full day after a no-goal day; workout + reading in one post; 7 photos; hit 2.0 L exactly.

Optional-goal streaks: owner toast only; never rank.

Max one toast per action.

---

## 13. Screens

| Screen | Purpose |
|--------|---------|
| Signup | Group code (or link) → email/password → name + photo |
| Login | Email + password |
| Today | Tracker: chips, water containers, diet button, post update, yesterday |
| Water containers | Add / label / volume / delete saved cups |
| Leaderboard | Current local day's required-challenges-achieved count |
| Feed | Group **Post update**s; react; comment (≤256) |
| Person | Calendar, daily stats, achievements, name, photo |
| Me | Optional goals; name; photo; **my reaction palette** |
| Admin | Reusable group code, invalidate a day, delete abuse, remove member |

No notifications screen. No rules explainer.

Full sitemap, chrome, and per-page contents: **§21**.

---

## 14. Day display state (derived, not pass/fail)

The following are display states for the calendar and tracker only. They are not an aggregate daily pass/fail result; each required challenge remains independently met or not met.

| Status | Meaning |
|--------|---------|
| `in_progress` | Today; at least one required goal met; not all 4 |
| `complete` | All 4 met |
| `partial` | Day closed; 1–3 met |
| `missed` | Day closed; **0** of 4 met |
| `unscored` | Before join, or before Sept 1 |

Logged nothing on a closed day → **missed** for display; it does not create a daily pass/fail score.

---

## 15. Data concepts

**User** — email, display name, profile photo, timezone, **reaction palette**

**Cohort** — start `2026-09-01`, no end date

**Membership** — user, join date

**Invite** — reusable group code (+ link)

**WaterContainer** — owner, label, volume_ml, sort order

**OptionalGoal** — owner, name, target, unit, active

**DayDelta** — quiet tap: user, local date, goal, amount or diet toggle (no feed row)

**Update** — **Post update** only: author, local date (today or yesterday), goals, amounts, note, photo

**DayRollup** — sums + diet + status from deltas + posts

**FeedPost** — 1:1 with Update

**Reaction** — user, post, emoji (from their palette)

**Comment** — body ≤ 256

**Achievement / UserAchievement**

---

## 16. Scoring formulas

```text
required_keys = [workout, water, reading, diet]

goal_met(day, key):
  workout: minutes >= 45
  water:   liters  >= 2.0
  reading: pages   >= 10
  diet:    tapped / posted diet for that date

member_local_today(user):
  calendar date of now() in user.timezone

daily_board_score(user):
  if member_local_today(user) < 2026-09-01
     OR member_local_today(user) < user.join_date:
    not eligible
  else:
    count of required_keys where goal_met(user, member_local_today(user), key)

editable_date:
  date == member_local_today(user)
  OR date == member_local_today(user) - 1
```

The daily Board recomputes from the member's current local date. At that member's local midnight, the previous score ends and the new day's score starts at 0.

---

## 17. Admin

- You are the first admin
- Rotate the **reusable group code**
- Remove a member
- **Invalidate a day:** force all four required challenges to not met; posts stay visible; no end date
- Delete a feed post (recalculate)

Cannot type amounts onto someone else's day.

---

## 18. Build slices

| Slice | Ships |
|-------|--------|
| 1 | Reusable group invite (link + code), you as admin, email/password, name + photo, Today |
| 2 | Workout/reading chips + custom; water containers + tap-to-add; diet button (all quiet) |
| 3 | Post update + photo (5 MB) + feed; reactions (defaults + custom palette); comments ≤256 |
| 4 | Shared calendar from 2026-09-01; yesterday edit; day rollup |
| 5 | Daily leaderboard by current-local-day count; group tracker |
| 6 | Optional personal goals |
| 7 | Achievements; admin invalidate / delete / remove |

---

## 19. Success bar

- Add water in one tap via a saved container
- Log workout or reading with one chip
- Diet in 1–2 taps; never auto
- Quiet taps do not flood the feed; Post update does
- Edit **yesterday** only
- Every member sees everyone else's today, feed, and rank
- Late joiner shares Day N; pre-join unscored
- Each required challenge is independently met/not met; no aggregate daily or weekly pass/fail
- After Day 75 the app keeps going with the daily leaderboard
- No notifications, no challenge explainer

---

## 20. Locked decisions

| Topic | Decision |
|-------|----------|
| Name | **75 Soft** |
| Start | 2026-09-01, shared |
| End | None. Day N and the daily leaderboard continue. |
| Late join | Same calendar; pre-join unscored |
| Workout | 45 min; chips +15 / +30 / +45 + custom |
| Water | 2.0 L; saved labeled containers, tap to add; +250 ml; custom |
| Reading | 10 pages; chips +5 / +10 + custom |
| Diet | One button, 1 tap met / 2nd unset. Not automatic. |
| Quiet vs feed | Tracker taps quiet. **Post update** → feed. |
| Edit window | Today + yesterday only |
| Photo | Optional on posts; camera or upload; 5 MB |
| Closed no-goal day | Display-only 0/4 state; no restart or leaderboard carryover. |
| Weekly scoring | None; calendar weeks are display groupings only |
| Optional goals | Personal; not scored |
| Invite | You seed admin. **Reusable** group code + link |
| Login | Email + password |
| Profile | Name + photo |
| Leaderboard | Current local day's count of required challenges met. Resets at local midnight; ties use competition ranking. |
| Reactions | Defaults 👍🔥😂❤️💪; each user can change their palette to any emoji |
| Comments | Max 256 characters |
| Achievements | Same list for everyone |
| Notifications | None |
| Timezone | Device local |

---

## 21. Pages and navigation

Mobile-first. **Three bottom tabs.** No Rules, Calendar, or Notifications tab. Compose and water-container CRUD are **sheets**, not tabs.

### Chrome

| Element | What it is |
|---------|------------|
| Bottom tabs | **Today** · **Feed** · **Board** |
| Header avatar | Opens **Me** |
| Header (optional) | Product name **75 Soft** + Day N on Today |

Sheets cover the tab bar. Person and Admin are pushed screens (back to where you came from).

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

| Page | Contents |
|------|----------|
| **Invite** | Type reusable group code, or land here from invite link (code prefilled) |
| **Signup** | Email + password → display name + profile photo |
| **Login** | Email + password |
| **Forgot password** | Email reset (not a tab; from Login) |

Invalid code: stay on Invite. After signup → **Today**.

### Today (tab, home)

Primary daily surface. Logging first; social second.

| Block | Contents |
|-------|----------|
| Header | **75 Soft**, local date, shared **Day N** |
| Group strip | One row: each member’s 4 goal dots + today’s achieved-challenge count. Tap a face → **Person** |
| **My grid** | Compact week or month heatmap (complete / partial / missed / future display states, not pass/fail). Market 75-day apps lead with this; it lives here, not on a Calendar tab. Tap a cell: today or yesterday open for edit; older cells are view-only |
| Workout | Progress `min / 45`; chips +15 / +30 / +45; custom |
| Water | Progress `L / 2.0`; tappable **containers**; +250 ml; custom; “manage” → containers sheet |
| Reading | Progress `pages / 10`; chips +5 / +10; custom |
| Diet | Button, 1 tap met / 2nd unset |
| Optional goals | Personal only; quiet unless posted |
| Actions | **Post update** · **Yesterday** (same layout, date = yesterday) |

Quiet taps do not leave this tab.

### Feed (tab)

| Block | Contents |
|-------|----------|
| List | Group **Post update**s, newest first |
| Item | Name, photo, time, goals/amounts, note, photo |
| React | Default palette or that user’s custom emojis |
| Comment | Field, max **256** characters |
| Author tap | **Person** |
| Photo tap | Lightbox (not a separate route) |

Empty state: one line, e.g. “No posts yet.” No filter chips. No chat.

### Board (tab)

| Block | Contents |
|-------|----------|
| List | Everyone, ranked by **today’s required challenges achieved** (count). Ties share a place using competition ranking |
| Row | Rank, photo, name, count. Tap → **Person** |

No extra sort tabs in v1.

### Person (push)

Opened from group strip, Feed, Board, or Me → “view profile”.

| Block | Contents |
|-------|----------|
| Header | Photo, display name, goals-achieved count |
| Grid | Their scored days (pre-join blank) |
| Today | Their four required-challenge states and today’s achieved count |
| Achievements | Unlocked badges; locked = ??? |
| Posts | Their feed posts |

If this is **you**, show **Edit** → Me. No extra settings on other people.

### Me (push from avatar)

| Block | Contents |
|-------|----------|
| Name + photo | Edit (camera or upload) |
| View profile | Own **Person** |
| Optional goals | Add / edit / archive |
| Reaction palette | Defaults 👍🔥😂❤️💪; change to any emoji |
| Logout | |
| Change password | Email/password accounts |
| **Admin** | Visible only to you |

### Sheets (not tabs)

| Sheet | From | Contents |
|-------|------|----------|
| **Post update** | Today | Goal chips, amounts, containers, note, camera or upload (5 MB), post |
| **Water containers** | Today | Add label + ml; edit; delete; reorder. No defaults |
| **Yesterday** | Today or grid | Same tracker as Today, date locked to yesterday |

### Admin (push, you only)

| Block | Contents |
|-------|----------|
| Group code | Show reusable code + copy link; rotate |
| Members | List everyone. Pick a person → invalidate a day, remove member |
| Abuse | Delete a feed post |

### Not pages

- Rules / onboarding / “what is 75 Soft”
- Notifications
- Chat
- Calendar tab (grid is on Today + Person)
- Standalone achievement gallery (on Person)
- Water as a bottom tab
