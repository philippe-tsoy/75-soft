# 75 Soft

The 75 Soft private group tracker. Product and implementation contracts live
in [`75-soft-spec/`](./75-soft-spec/).

## Local setup

1. Install Node.js 20+ and the dependencies with `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Add the Supabase URL, publishable/anon key, service-role key, and a random
   invite-intent secret.
4. Apply the numbered migrations in `database/migrations/` in order
   (`0001_core.sql` through `0009_remove_default_water_containers.sql`) to the Supabase
   project.
5. Start the app with `npm run dev`.

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
