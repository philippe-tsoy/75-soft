# 75 Soft — UI and Navigation Subspec

**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Related:** [API_CONTRACTS.md](./API_CONTRACTS.md), [SCORING_AND_ROLLUPS.md](./SCORING_AND_ROLLUPS.md)

## 1. Navigation contract

### Public routes

```text
/invite
/signup
/login
/forgot-password
/auth/callback
```

Public routes have no bottom tabs. A valid invite link lands on Invite with the code prefilled.

### Protected routes

```text
/(app)/today
/(app)/feed
/(app)/board
/(app)/person/:userId
/(app)/me
/(app)/admin
```

The app shell has exactly three bottom tabs:

```text
Today · Feed · Board
```

The header avatar opens Me. Person and Admin are pushed screens with a back action. Post update, Water containers, and Yesterday are sheets or modal routes that cover the tab bar; they are not bottom tabs.

Do not add Rules, Calendar, Notifications, Chat, Water, or Achievement Gallery routes in v1.

## 2. App shell

### Header

On Today show:

- `75 Soft`;
- viewer's local date;
- shared Day N;
- avatar button opening Me.

Other tabs may use a compact header with the same avatar affordance.

### Bottom navigation

- fixed or sticky above the device safe-area inset;
- active tab has a text label and non-color indicator;
- preserves scroll position when switching tabs where practical;
- does not appear on auth pages or while a sheet covers the screen.

## 3. Today screen

Today is the primary daily surface, in this order:

1. Header.
2. Group strip.
3. Personal week/month heatmap.
4. Workout card.
5. Water card.
6. Reading card.
7. Diet control.
8. Optional goals.
9. Post update action.
10. Yesterday action.

### Group strip

Show each active member's photo/name plus four required-goal dots and today's achieved-challenge count. Dots use icon/label plus color so status is not color-only. Tapping a member opens Person.

The strip must not expose another member's raw amounts or private optional goals.

### Personal grid

Provide a compact week/month heatmap on Today. Cells show descriptive progress states—complete, partial, missed, future, or unscored—not a daily pass/fail result. Tapping:

- today → Today editing state;
- yesterday → Yesterday sheet;
- older date → view-only detail;
- future/pre-join date → no mutation.

There is no standalone Calendar tab.

### Workout

Display `minutes / 45`. Provide one-tap chips:

```text
+15 · +30 · +45 · Custom
```

Custom input accepts a positive whole number of minutes. Successful taps update the progress immediately and do not create a feed item.

### Water

Display `liters / 2.0 L`, while preserving exact ml internally. Show saved containers as large one-tap controls, plus `+250 ml`, `Custom`, and `Manage`.

- One container tap adds that container's current volume.
- Long-press is an enhancement only; an edit icon/menu must provide an accessible alternative.
- Custom accepts ml or L and shows the normalized amount before submission.
- Manage opens the Water containers sheet.

### Reading

Display `pages / 10`. Provide:

```text
+5 · +10 · Custom
```

Custom input accepts a positive whole number of pages.

### Diet

Use one explicit toggle/button with a visible met/unset state. First tap sets met; second tap unsets it. Never infer diet from another goal or from a time of day.

### Optional goals

Show only the viewer's active optional goals. Each supports its configured checkbox or amount interaction and remains quiet. Include a path to add/edit/archive goals in Me. Optional-goal logs never change required dots, daily challenge count, or Board.

### Actions

`Post update` opens the compose sheet. `Yesterday` opens the same tracker components with a locked date label and only yesterday's edit permissions.

## 4. Yesterday sheet

The sheet title includes the local date and shared Day N. It reuses the four required goal controls, containers, and optional controls.

- The date cannot be changed from the sheet.
- Amount chips/container taps and diet toggle are enabled only when the date is the member's actual previous local date and not invalidated.
- Posts created here are stamped with yesterday's local date.
- Older dates are never editable from this sheet.
- If the user joined after yesterday or before the cohort start, show an unscored/read-only state.

## 5. Post update sheet

The compose sheet contains:

1. Goal selection: one or more required and/or optional goals.
2. Amount control for each selected amount goal, using the same chips, containers, and custom conversions as Today.
3. Optional note.
4. Optional one-photo picker:
   - Take photo on camera-capable devices;
   - Upload from library;
   - desktop upload fallback when camera is unavailable.
5. Post action.

Rules:

- At least one goal is required.
- Multiple goals and multiple posts per day are allowed.
- Optional-goals-only posts are valid and do not score.
- Photo is one file, jpeg/png/webp, maximum 5 MB.
- A post amount contributes to the day only after the post is successfully published.
- Show a clear `Posting…` state and prevent duplicate submits; retry uses the same client operation id.
- On success close the sheet, update Today, and show at most one achievement toast.

The note is rendered as text. The master spec does not set a note length; use a centralized technical limit and present it as UI guidance rather than silently truncating.

## 6. Feed screen

Show one reverse-chronological group feed containing Post updates only.

Each item includes:

- author photo and display name;
- viewer-local timestamp;
- local date/Day N where useful;
- selected goals and amounts;
- note when present;
- photo thumbnail when present;
- reaction summary;
- comment list/input.

Interactions:

- author tap → Person;
- photo tap → in-place lightbox, not a new route;
- reaction button → current user's palette;
- selecting a different palette emoji replaces the current reaction; an explicit `Remove reaction` action calls the delete endpoint;
- comment input enforces 256 characters and has no edit action;
- author/admin can delete permitted posts/comments.

Empty state: `No posts yet.` Do not add filters, chat affordances, or notification badges.

Use cursor pagination and an explicit loading-more state. Preserve the feed scroll position across a lightbox close.

## 7. Board screen

Display all active members ranked by the current local day's required challenges achieved count:

```text
rank · photo · display name · today's goals achieved
```

Ties display the same rank using competition ranking. The row has no hidden secondary sort control. Tap a row → Person.

Do not present optional goals, reaction totals, streaks, prior-day totals, or join date as ranking factors.

## 8. Person screen

Opened from Group strip, Feed, Board, or Me. Show:

- photo, display name, today's required-challenge count;
- required-goal calendar with pre-join days blank;
- current local date's four required-challenge states;
- achievements, with locked hidden entries as `???`;
- that person's published posts.

For the current user, show `Edit` leading to Me. Do not show edit controls for another person.

## 9. Me screen

Show:

- display name and profile photo editing;
- own Person view;
- optional goal list with add/edit/archive;
- reaction palette editor;
- logout;
- change password for email/password accounts;
- Admin entry only when the server says the user is an admin.

Profile photo editing offers camera and upload. Show upload errors without losing the rest of the profile form.

### Reaction palette editor

Start with:

```text
👍 🔥 😂 ❤️ 💪
```

Allow add/remove/reorder/replace with a safe configured number of entries and valid emoji strings. Existing reactions remain the emoji that was sent.

## 10. Water containers sheet

Show active containers in order with:

- label;
- volume in ml;
- edit;
- delete;
- reorder;
- add container.

Seed new members with `Glass` 250 ml and `Bottle` 500 ml. Deleting a container does not change historical water logs.

## 11. Admin screen

Visible and routable only for the admin:

### Group code

- show current reusable code;
- copy invite link;
- rotate with explicit confirmation;
- explain that rotation invalidates the old code for new signup.

### Members

- list active members;
- select a member;
- choose a local date for invalidation;
- enter optional reason;
- confirm invalidation;
- remove member with explicit confirmation.

### Abuse

Allow admin deletion of a feed post. The UI must state that deletion removes that post's logged amounts from scoring while keeping the moderation action audited.

Admin cannot type amounts onto another member's day.

## 12. Auth screens

### Invite

- code input;
- invite-link prefill;
- validate action;
- invalid code remains on the same screen;
- successful validation continues to Signup.

### Signup

- Google continuation;
- email/password form;
- display name;
- profile photo;
- timezone capture/confirmation;
- clear confirmation-pending state if email confirmation is enabled.

### Login

- Google continuation;
- email/password;
- Forgot password link.

After successful signup or login, route to Today rather than a dashboard or onboarding lesson.

## 13. Shared interaction states

Every mutation surface needs:

- disabled submit/control while a request is in flight;
- optimistic feedback only for safe amount increments;
- rollback and retry for failed optimistic increments;
- stale-session handling that preserves form draft;
- server validation error next to the relevant field/control;
- success confirmation that does not require navigating away.

Use skeletons for first load, an inline retry state for failed data reads, and a short empty state for legitimately empty collections.

## 14. Accessibility and responsive behavior

- Minimum 44×44 CSS pixel touch targets.
- Keyboard-accessible sheets, lightbox, menus, and long-press alternatives.
- Focus moves into an opened sheet/lightbox and returns to its trigger on close.
- Use semantic buttons/links, labels, and live regions for optimistic/error status.
- Never convey met/missed state by color alone.
- Respect reduced-motion preference.
- Support narrow mobile widths first, then expand cards/columns for tablet/desktop.
- Ensure custom numeric inputs have inputmode and clear unit labels.
- Avatar/photo controls have text alternatives; decorative images use empty alt text.

