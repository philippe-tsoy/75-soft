# 75 Soft — Testing and Operations Subspec

**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Related:** [PHASES_AND_ACCEPTANCE.md](./PHASES_AND_ACCEPTANCE.md), [SCORING_AND_ROLLUPS.md](./SCORING_AND_ROLLUPS.md)

The highest-risk parts of this app are date boundaries, additive rollups, private-group access, and post deletion. Test those independently of the UI before relying on end-to-end tests.

## 1. Test layers

| Layer | Scope | Required tooling |
|-------|-------|------------------|
| Unit | Date math, input conversion, challenge states, daily Board score, tie ranking | Vitest |
| Component | Goal controls, sheets, grid states, palette, errors | React Testing Library |
| API | Authz, validation, idempotency, DTOs, upload limits | Vitest + request harness |
| Database | Migrations, RPCs, rollups, constraints, RLS | Local Supabase/Postgres |
| Browser | Auth, Today, Feed, Board, Person, Me, Admin journeys | Playwright |
| Manual | Camera/upload, mobile gestures, accessibility, timezone/device behavior | Real mobile and desktop |

## 2. Golden scoring fixtures

Keep deterministic fixtures with a frozen `now`, profile timezone, join date, and source events. Every formula in `SCORING_AND_ROLLUPS.md` must have at least one database and unit-level assertion.

| Fixture | Expected result |
|---------|-----------------|
| Sep 1, 2026 | Day 1; each required challenge starts not met |
| Three met challenges today | Daily Board score is 3 |
| Four met challenges today | Daily Board score is 4 |
| Empty open today | Neutral open display; daily Board score is 0 |
| Empty closed day | Closed no-goal display; no score carries forward |
| Join on Sep 4 | Sep 1–3 unscored; daily Board begins on Sep 4 |
| Local midnight | Previous score ends and new local date starts at 0 |
| Different member timezones | Each Board row uses its member's own local date |
| 15 + 30 workout | 45 minutes and met |
| 250 ml container changed to 500 ml | old event remains 250 ml |
| 1 L + 1,000 ml water | exactly 2,000 ml and met |
| diet set, unset, set | final state met |
| post with diet then delete | prior active diet event is restored |
| optional-only post | feed-visible; zero required goals |
| invalidated complete day | all four challenge flags false and daily Board score 0; post remains visible |
| new post between feed requests | cursor does not duplicate/skip older records |
| same mutation retried | one delta/post and one scoring effect |
| two equal board counts | equal competition rank; no hidden tie-break |

## 3. Timezone and boundary matrix

Run the same fixture for at least:

- `America/New_York`;
- `America/Los_Angeles`;
- `Europe/London`;
- `Asia/Tokyo`;
- a DST transition date.

Verify:

- Today and yesterday change at local midnight, not server midnight;
- Day N is derived from the local calendar date;
- the user's join local date is stable;
- feed instants render in the viewer's timezone;
- a timezone change does not rewrite existing local dates;
- each member's daily Board resets at their own local midnight, including across DST.

## 4. Database and RLS tests

For each table and read function, test as:

1. anonymous user;
2. active member A;
3. active member B;
4. removed member;
5. admin.

Minimum assertions:

- anonymous cannot read profiles, posts, board, group strip, or raw logs;
- member A cannot read member B's optional goals, raw day events, or container rows;
- member A can read published group posts and aggregate Person data;
- member A cannot mutate B's day, post, profile, reaction, or comment;
- a removed member cannot read group data after removal;
- member A cannot invoke admin functions;
- admin cannot write amounts onto another member's day;
- admin can invalidate/delete/remove only through audited paths;
- deleted/pending/failed posts are excluded from feed and scoring;
- Storage objects cannot be read without a valid member-scoped signed URL.

Test RLS through a real authenticated client context; SQL editor/service-role tests alone are insufficient because they bypass RLS.

## 5. API contract tests

Cover:

- malformed JSON and unknown goal keys;
- zero/negative/non-integer amount values;
- liter-to-ml conversion and overflow bounds;
- today/yesterday/older/future/pre-join date authorization;
- duplicate operation id behavior;
- stale or invalid invite intents;
- OAuth callback state mismatch;
- comment length measured by user-visible characters;
- reaction not in current palette;
- optional goal belonging to another user;
- post with no goals;
- post with duplicate goal entries;
- invalid photo MIME, extension mismatch, and over-5 MB payload;
- expired session during a mutation;
- admin endpoint called by a member.

Assert both status code and stable error code. Do not snapshot secret-bearing error details.

## 6. Browser acceptance journeys

### Member journey

1. Open an invalid invite; remain on Invite.
2. Open a valid link; code is prefilled and signup is reachable.
3. Complete signup; land on Today.
4. Log workout and reading with one chip each.
5. Add water with a saved container and custom amount.
6. Toggle diet on and off.
7. Confirm quiet actions do not appear in Feed.
8. Open Yesterday and add a log.
9. Post required and optional goals with a photo.
10. React using a custom palette and add a 256-character comment.
11. Open author Person from Feed and own Person from Me.
12. Verify Board count and rank.

### Admin journey

1. Open Admin from Me as admin.
2. Copy invite link and rotate code.
3. Confirm old code cannot complete new signup.
4. Invalidate a member day; verify all four challenges are not met, daily Board score is 0, and post visibility is unchanged.
5. Delete a post; verify feed removal and rollup recalculation.
6. Remove a member; verify access is blocked and action is audited.

### Error/recovery journey

- disconnect during an amount tap and retry;
- refresh during a pending photo upload;
- expire session while a compose sheet is open;
- submit duplicate post request;
- close/reopen a sheet with keyboard and screen reader;
- use the app at narrow mobile and desktop widths.

## 7. Accessibility checks

- Run automated axe checks on each primary screen.
- Navigate all controls with keyboard only.
- Verify focus trapping/restoration for sheets and lightbox.
- Verify met/missed/future/unscored states with text and icon, not only color.
- Verify form labels, live mutation errors, and upload announcements.
- Verify touch targets and safe-area spacing on real mobile hardware.

## 8. Observability

Log structured events without secrets:

```text
auth.completed
invite.validated
day.delta_created
day.diet_toggled
post.published
post.deleted
rollup.recalculated
admin.day_invalidated
admin.member_removed
```

Each event may include request id, actor id, cohort id, resource id, local date, duration, and outcome. Never log passwords, access tokens, clear invite codes, signed URLs, image contents, or full notes/comments.

Monitor:

- API 4xx/5xx rates;
- failed post/photo cleanup;
- duplicate/idempotency conflicts;
- rollup RPC latency and errors;
- Auth callback failures;
- Storage rejection and orphan counts;
- database connection and query latency.

## 9. Deployment and migration

Before production:

- apply migrations to a disposable Supabase project;
- run seed and RLS tests against that project;
- configure production Auth site/redirect URLs;
- configure only public Supabase URL/key in browser environment;
- store service-role key in server-only deployment secrets;
- create the private `post-photos` bucket and policies;
- create the operator admin membership manually;
- generate the first invite through the admin/secure setup path;
- verify backups and a rollback plan;
- run the browser smoke suite against the production-like environment.

Migrations must be forward-only and idempotent where safe. A migration that changes scoring must include fixture updates and a short data-recalculation plan.

## 10. Release checklist

- [ ] Build, lint, typecheck, unit, component, API, DB/RLS, and browser tests pass.
- [ ] Scoring golden fixtures match expected values.
- [ ] Timezone/DST matrix passes.
- [ ] No anonymous/non-member data leak is observed.
- [ ] Photo limits are enforced server-side.
- [ ] Invite rotation and admin audit work.
- [ ] Error monitoring and structured logs are active.
- [ ] No notification, chat, rules, calendar, water, or achievement-gallery tab has shipped.
- [ ] Product owner resolves open decisions in the review before public group use.

