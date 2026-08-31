import { beforeAll, describe, expect, it } from "vitest";

import {
  createDatabaseClient,
  databaseConfigurationMessage,
  databaseTestConfig,
} from "./support";

const probeUserId = "00000000-0000-0000-0000-000000000001";

describe("W8 live database contract", () => {
  if (databaseTestConfig.missing.length > 0) {
    it.skip(databaseConfigurationMessage, () => undefined);
    return;
  }

  let client: ReturnType<typeof createDatabaseClient>;

  beforeAll(() => {
    client = createDatabaseClient();
  });

  it("has every data-model table after migrations are applied", async () => {
    const tables = [
      "cohorts",
      "profiles",
      "memberships",
      "invite_codes",
      "signup_intents",
      "water_containers",
      "optional_goals",
      "optional_goal_logs",
      "day_deltas",
      "posts",
      "post_goal_entries",
      "reactions",
      "comments",
      "day_overrides",
      "achievements",
      "user_achievements",
      "audit_log",
    ] as const;

    for (const table of tables) {
      const { error } = await client.from(table).select("*").limit(0);
      expect(error, `${table} is missing or unreadable`).toBeNull();
    }
  });

  it("exposes the documented rollup RPCs with stable callable signatures", async () => {
    const rpcCalls = [
      ["get_day_rollup", { user_id: probeUserId, local_date: "2026-09-01" }],
      [
        "get_calendar",
        {
          user_id: probeUserId,
          from_date: "2026-09-01",
          to_date: "2026-09-02",
        },
      ],
      ["get_group_strip", { viewer_id: probeUserId }],
      [
        "get_person_summary",
        { viewer_id: probeUserId, subject_id: probeUserId },
      ],
      ["get_board", { viewer_id: probeUserId }],
      ["get_feed_page", { viewer_id: probeUserId, cursor: null, limit: 20 }],
    ] as const;

    for (const [functionName, args] of rpcCalls) {
      const { error } = await client.rpc(functionName, args);
      expect(
        error,
        `${functionName} is not deployed with the documented argument names`,
      ).toBeNull();
    }
  });

  it("keeps post media private at the storage boundary", async () => {
    const { data, error } = await client.storage.getBucket("post-photos");

    expect(error).toBeNull();
    expect(data?.public).toBe(false);
  });
});
