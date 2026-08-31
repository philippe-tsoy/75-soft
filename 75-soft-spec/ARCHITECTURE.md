# 75 Soft — Architecture Subspec

**Parent:** [MASTER_SPEC.md](./MASTER_SPEC.md)  
**Package index:** [IMPLEMENTATION_INDEX.md](./IMPLEMENTATION_INDEX.md)

## 1. Architecture goals

| Goal | Implementation consequence |
|------|-----------------------------|
| Few taps to log | Today is server-rendered for fast first paint and uses optimistic mutations for amount chips |
| Correct shared scoring | PostgreSQL functions are authoritative for local dates, rollups, required-challenge states, and daily leaderboard counts |
| Private group | Every app-data query is scoped to the active membership and protected by RLS |
| Mobile-first social feed | Cursor pagination, bounded media, lazy images, and sheets instead of extra routes |
| Small implementation surface | One cohort, one active invite, four required goals, and feature-oriented modules |
| Safe moderation | Admin mutations run through audited server endpoints and never trust client role flags |

## 2. Runtime topology

```text
┌────────────────────────────────────────────┐
│ Next.js App Router                         │
│ Server-rendered route shell + client UI    │
│ TanStack Query for server state             │
└──────────────────────┬─────────────────────┘
                       │ HTTPS / session cookie
                       ▼
┌────────────────────────────────────────────┐
│ Next.js route handlers                      │
│ auth/session checks · Zod validation        │
│ membership/admin checks · orchestration     │
└───────────────┬───────────────┬────────────┘
                │               │
                ▼               ▼
        ┌──────────────┐ ┌──────────────┐
        │ Supabase Auth│ │ PostgreSQL   │
        │ identities   │ │ RLS + RPC    │
        └──────────────┘ └──────┬───────┘
                                │
                                ▼
                         ┌──────────────┐
                         │ Private      │
                         │ post photos  │
                         └──────────────┘
```

The browser may use Supabase Auth's client methods for email/password sign-in. Application data mutations and reads go through typed route handlers so that validation, audit behavior, and response shapes are consistent.

## 3. Repository structure

```text
75-soft/
├── app/
│   ├── (auth)/
│   │   ├── invite/
│   │   ├── signup/
│   │   ├── login/
│   │   └── forgot-password/
│   ├── (app)/
│   │   ├── today/
│   │   ├── feed/
│   │   ├── board/
│   │   ├── person/[userId]/
│   │   ├── me/
│   │   └── admin/
│   ├── auth/callback/
│   └── api/
│       ├── auth/
│       ├── invite/
│       ├── day/
│       ├── containers/
│       ├── posts/
│       ├── feed/
│       ├── profiles/
│       ├── optional-goals/
│       ├── board/
│       └── admin/
├── components/
│   ├── ui/
│   ├── app-shell/
│   ├── day/
│   ├── feed/
│   └── profile/
├── features/
│   ├── auth/
│   ├── day-tracking/
│   ├── feed/
│   ├── profiles/
│   ├── board/
│   ├── achievements/
│   └── admin/
├── lib/
│   ├── supabase/
│   ├── validation/
│   ├── dates/
│   ├── scoring/
│   ├── storage/
│   └── http/
├── database/
│   ├── migrations/
│   ├── functions/
│   ├── seed.sql
│   └── test/
└── docs/spec/
```

Feature modules may import shared code from `lib/` and `components/`. A feature must not reach into another feature's private implementation. Cross-feature DTOs and constants live in `lib/`.

## 4. Rendering and state boundaries

| State | Owner |
|-------|-------|
| Auth session and membership shell | Supabase session + server layout |
| Today, feed, board, Person data | TanStack Query |
| Form fields and post draft | React Hook Form/local component state |
| Current sheet, lightbox, and confirmation dialog | URL search params or local UI state |
| Scoring and rollups | Database functions, returned as DTOs |
| Cached profile photo URLs | Query cache; signed URLs are refreshed as needed |

Do not put day entries, feed posts, or leaderboard rows in a global client store. A mutation must update or invalidate the relevant query keys after the server responds.

## 5. Request flows

### 5.1 Session bootstrap

```text
request
  → proxy refreshes Supabase session
  → protected layout checks authenticated user
  → server query checks active membership
  → no membership → invite-required / access-denied state
  → member → render app shell and current local day
```

The server must not treat a client-supplied `userId`, role, date, or timezone as authoritative.

### 5.2 Quiet amount log

```text
tap chip/container
  → create a unique clientOperationId for this tap
  → optimistic increment in the active day query
  → POST /api/day/{localDate}/entries
  → authenticate + validate editable date
  → database function inserts idempotent delta
  → database returns fresh day rollup + achievement events
  → reconcile query cache
```

If the request fails, rollback the optimistic increment and show a retryable inline error. The retry must reuse the same operation id; a new user tap gets a new operation id.

### 5.3 Diet toggle

```text
tap diet
  → POST /api/day/{localDate}/diet/toggle
  → database function locks the user's date state
  → append a set/unset event based on current derived state
  → return fresh rollup
```

The client must not calculate the next diet value from a stale cached response.

### 5.4 Post update with optional photo

```text
submit compose sheet
  → client validates required goal selection and photo size/type
  → POST multipart request
  → server validates membership, local date, entries, note, and photo
  → create pending post and its entry rows
  → upload to private Storage path
  → mark post published
  → evaluate derived day state and achievements
  → return post, fresh day rollup, and newly unlocked toasts
```

If Storage upload fails, the pending post and entry rows are removed or marked failed and excluded from scoring. A cleanup job removes abandoned pending rows and orphaned objects. Published posts are the only rows visible in the feed and the only post entries counted in rollups.

## 6. Time handling

- Store instants as `timestamptz` and dates as ISO `date` values.
- Store the user's IANA timezone on the profile, for example `America/New_York`.
- At a mutation, derive `localDate` on the server from the authenticated user's stored timezone.
- Persist the resulting local date on every delta, post, and optional-goal log. Historical rows are not rewritten when a user changes timezone.
- Compute Day N and any calendar grouping from local calendar dates, never from elapsed 24-hour periods.
- Convert feed `created_at` instants to the viewer's timezone for display.
- Use one shared date utility in TypeScript and matching PostgreSQL functions. No component may implement date arithmetic ad hoc.

## 7. Database access strategy

Use direct Supabase queries for simple member-scoped reads and database functions for operations that must be atomic or derived:

| Operation | Required boundary |
|-----------|-------------------|
| Load current user/profile | Server query with RLS |
| Load Today and Person rollups | Read RPC/view |
| Add amount | Transactional RPC |
| Toggle diet | Transactional RPC |
| Create/delete post | Route handler + transaction + Storage compensation |
| Reactions/comments | RLS-protected route mutation |
| Board | Read RPC/view |
| Invalidate day/remove member/rotate invite | Admin route + transactional RPC |
| Achievement evaluation | Database function or server service invoked after mutation |

The Supabase service-role key is server-only and is used only where a controlled admin or storage cleanup operation cannot be performed with the user's RLS session. It must never be serialized into a response or bundled for the browser.

## 8. Caching and query keys

Recommended keys:

```text
['session']
['profile', 'me']
['day', userId, localDate]
['today', userId, localDate]
['group-strip', localDate]
['feed', cursor]
['post', postId]
['board']
['person', userId]
['optional-goals', userId]
['containers', userId]
['achievements', userId]
['admin', 'members']
['admin', 'invite']
```

After a quiet entry mutation, invalidate the active day, group strip, Person data for the owner, board, and achievements. After a post mutation, also invalidate feed and the author's post list. After a post deletion, invalidate the same keys because amounts may have changed.

## 9. Media strategy

- Storage bucket: private `post-photos`.
- Path: `posts/{author_id}/{post_id}/{random_id}.{extension}`.
- The server verifies MIME type and byte length; the client check is only an early UX check.
- Generate a short-lived signed URL for member reads. Never expose a permanent public URL.
- Keep the original allowed image format unless an image-processing service is explicitly added; do not claim successful compression without checking the resulting bytes.
- Delete the Storage object when the post is deleted, while keeping the post row/audit record according to the data model.

## 10. Security and privacy boundaries

1. RLS is enabled on every user-data table.
2. Membership is checked on every group read, including feed, board, Person, and signed-photo URL creation.
3. Admin status is resolved server-side from the database.
4. User-supplied notes, comments, display names, and emoji are rendered as text, never as HTML.
5. Rate-limit invite validation, auth attempts where supported, comments, reactions, and photo uploads.
6. Do not log passwords, access tokens, invite codes, photo contents, or full private payloads.
7. Use CSRF protection appropriate to the chosen cookie/API setup and require same-origin mutation requests.

## 11. Performance targets

| Metric | Initial target |
|--------|----------------|
| Today first contentful interaction on 4G | usable within 2.5 seconds |
| Amount tap perceived response | optimistic state change under 100 ms |
| Feed page | 20 posts per cursor page |
| Board/group strip | one bounded aggregate query each |
| Photo payload | reject over 5 MB before Storage upload |

These are engineering targets, not product guarantees. Measure them on a representative mobile device before release.

