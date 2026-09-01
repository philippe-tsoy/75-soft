# 75 Soft

The 75 Soft private group tracker. Product and implementation contracts live
in [`75-soft-spec/`](./75-soft-spec/).

## Local setup

1. Install Node.js 20+ and the dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase URL, publishable/anon key, service-role key, and a random
   invite-intent secret. Set `NEXT_PUBLIC_APP_URL` to the public app origin;
   do not share invite links generated from `localhost`.
4. Apply the numbered migrations in `database/migrations/` in order
   (`0001_core.sql` through `0011_water_container_sort_order_unique.sql`) to
   the Supabase project.
5. Start the app with `npm run dev`.

For Vercel, add all five variables to the deployment environment and redeploy
after changing them. `SUPABASE_SERVICE_ROLE_KEY` is required by login, invite
validation, and signup; it must belong to the same Supabase project as the
public URL/key. Set `NEXT_PUBLIC_APP_URL` to
`https://75-soft-seven.vercel.app` (or your custom production domain) so
copied invite links do not point to localhost.

`vercel.json` pins functions to `pdx1` because the Supabase project is in
`us-west-2`. Server rendering makes several dependent database round trips per
page, so colocating the functions with the database matters far more than
their distance to the browser. Change the region if the database moves.

The service-role key is server-only. It must never be imported by a client
component or exposed as a `NEXT_PUBLIC_` variable.

## W0 foundation commands

```text
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

W0 provides the shared configuration, canonical DTOs, date and scoring
primitives, validation, HTTP responses, Supabase clients, storage guards,
common UI primitives, the core migration/RLS helpers, and test fixtures.
Feature workstreams should consume these contracts rather than redefining them.
