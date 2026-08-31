import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationDirectory = resolve(process.cwd(), "database", "migrations");

const migrationNames = readdirSync(migrationDirectory)
  .filter((name) => /^\d+_.+\.sql$/u.test(name))
  .sort((left, right) => {
    const leftNumber = Number(left.split("_", 1)[0]);
    const rightNumber = Number(right.split("_", 1)[0]);
    return leftNumber - rightNumber;
  });

function migration(name: string): string {
  return readFileSync(`${migrationDirectory}/${name}`, "utf8");
}

function compactSql(sql: string): string {
  return sql.toLowerCase().replace(/\s+/gu, " ").trim();
}

function expectSql(sql: string, fragment: string): void {
  expect(compactSql(sql)).toContain(compactSql(fragment));
}

describe("W8 migration contracts", () => {
  it("keeps numbered migrations forward-only and transaction-wrapped", () => {
    expect(migrationNames).toContain("0001_core.sql");
    expect(new Set(migrationNames).size).toBe(migrationNames.length);

    const migrationNumbers = migrationNames.map((name) =>
      Number(name.split("_", 1)[0]),
    );
    expect(migrationNumbers).toEqual(
      [...migrationNumbers].sort((a, b) => a - b),
    );

    for (const name of migrationNames) {
      const sql = migration(name);
      expect(sql).toMatch(/\bbegin\s*;/iu);
      expect(sql).toMatch(/\bcommit\s*;/iu);
      expect(sql).not.toMatch(/\bdrop\s+table\b/iu);
      expect(sql).not.toMatch(/\btruncate\s+/iu);
    }
  });

  it("covers the core tables, constraints, helpers, and RLS policies", () => {
    const core = migration("0001_core.sql");

    for (const table of [
      "cohorts",
      "profiles",
      "memberships",
      "invite_codes",
      "signup_intents",
      "audit_log",
    ]) {
      expectSql(core, `create table if not exists public.${table}`);
      expectSql(core, `alter table public.${table} enable row level security`);
    }

    expectSql(core, "constraint cohorts_date_range check");
    expectSql(core, "constraint profiles_display_name_not_blank check");
    expectSql(core, "constraint profiles_reaction_palette_array check");
    expectSql(core, "constraint memberships_role_check check");
    expectSql(core, "constraint memberships_removed_actor_check check");
    expectSql(core, "create unique index if not exists cohorts_one_active");
    expectSql(
      core,
      "create unique index if not exists memberships_one_active_admin",
    );
    expectSql(
      core,
      "create unique index if not exists invite_codes_one_active_per_cohort",
    );

    for (const functionName of [
      "private.active_cohort_id()",
      "private.is_active_member(p_user_id uuid)",
      "private.is_admin(p_user_id uuid)",
    ]) {
      expectSql(core, `create or replace function ${functionName}`);
      expectSql(core, "security definer");
      expectSql(core, "set search_path = public");
    }

    for (const policy of [
      "profiles_member_select",
      "profiles_owner_update",
      "memberships_member_select",
      "invite_codes_admin_select",
      "audit_log_admin_select",
    ]) {
      expectSql(core, `create policy ${policy}`);
    }

    expectSql(
      core,
      "revoke all on function private.is_admin(uuid) from public",
    );
    expectSql(
      core,
      "grant execute on function private.is_active_member(uuid) to authenticated",
    );
    expect(core).not.toMatch(
      /insert\s+into\s+public\.invite_codes[\s\S]*['"][^'"]{8,}['"]/iu,
    );
  });

  it("keeps optional goals owner-scoped and retry-safe", () => {
    const optionalGoals = migration("0005_optional_goals.sql");

    for (const table of ["optional_goals", "optional_goal_logs"]) {
      expectSql(optionalGoals, `create table if not exists public.${table}`);
      expectSql(
        optionalGoals,
        `alter table public.${table} enable row level security`,
      );
    }

    expectSql(optionalGoals, "optional_goals_shape_check");
    expectSql(optionalGoals, "optional_goal_logs_value_check");
    expectSql(optionalGoals, "optional_goal_logs_shape_check");
    expectSql(optionalGoals, "unique (owner_id, client_operation_id)");
    expectSql(optionalGoals, "private.validate_optional_goal_log()");
    expectSql(optionalGoals, "optional_goal_logs_validate_shape");
    expectSql(optionalGoals, "owner_id = auth.uid()");
    expectSql(optionalGoals, "revoke all on public.optional_goals from anon");
    expectSql(
      optionalGoals,
      "revoke update, delete on public.optional_goal_logs from authenticated",
    );
  });

  it("qualifies admin invite rotation references", () => {
    const rotation = migration("0010_fix_admin_rotate_invite_ambiguity.sql");

    expectSql(
      rotation,
      "create or replace function public.admin_rotate_invite",
    );
    expectSql(rotation, "where invite.cohort_id = v_cohort_id");
    expectSql(rotation, "returning * into v_new_invite");
    expect(rotation).not.toMatch(/invite_codes\.cohort_id\s*=\s*cohort_id/iu);
  });
});
