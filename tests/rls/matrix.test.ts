import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  closeRlsContexts,
  createRlsContexts,
  invokeRpc,
  rlsConfig,
  rlsConfigurationMessage,
  selectRows,
  type RlsContexts,
} from "./support";

function records(rows: unknown[]): Record<string, unknown>[] {
  return rows.filter(
    (row): row is Record<string, unknown> =>
      typeof row === "object" && row !== null && !Array.isArray(row),
  );
}

function ids(rows: unknown[], key = "id"): string[] {
  return records(rows).flatMap((row) => {
    const value = row[key];
    return typeof value === "string" ? [value] : [];
  });
}

describe("W8 real authenticated RLS matrix", () => {
  if (rlsConfig.missing.length > 0) {
    it.skip(rlsConfigurationMessage, () => undefined);
    return;
  }

  let contexts: RlsContexts | undefined;

  beforeAll(async () => {
    contexts = await createRlsContexts();
  });

  afterAll(async () => {
    await closeRlsContexts(contexts);
  });

  it("denies anonymous access to group, private, and raw event rows", async () => {
    const client = contexts?.anonymous;
    expect(client).toBeDefined();

    const tables = [
      ["profiles", "id"],
      ["memberships", "user_id"],
      ["posts", "id"],
      ["day_deltas", "id"],
      ["optional_goals", "id"],
      ["optional_goal_logs", "id"],
      ["audit_log", "id"],
    ] as const;

    for (const [table, column] of tables) {
      const rows = await selectRows(client!, table, column, [], {
        allowDenied: true,
      });
      expect(rows, `anonymous rows leaked from ${table}`).toHaveLength(0);
    }
  });

  it("allows member A to see active member identity and published posts", async () => {
    const client = contexts?.memberA;
    expect(client).toBeDefined();

    const ownProfile = await selectRows(client!, "profiles", "id", [
      ["id", rlsConfig.accounts.memberA.userId],
    ]);
    expect(ids(ownProfile)).toEqual([rlsConfig.accounts.memberA.userId]);

    const memberProfiles = await selectRows(client!, "profiles", "id", [
      ["id", rlsConfig.accounts.memberB.userId],
    ]);
    expect(ids(memberProfiles)).toEqual([rlsConfig.accounts.memberB.userId]);

    const publishedPosts = await selectRows(
      client!,
      "posts",
      "id, author_id, status",
      [["status", "published"]],
    );
    expect(
      records(publishedPosts).every((row) => row.status === "published"),
    ).toBe(true);
  });

  it("keeps each member away from the other member's private rows", async () => {
    const privateTables = [
      ["optional_goals", "owner_id"],
      ["optional_goal_logs", "owner_id"],
      ["water_containers", "owner_id"],
      ["day_deltas", "user_id"],
    ] as const;

    for (const { label, client, ownerId } of [
      {
        label: "member A read member B",
        client: contexts?.memberA,
        ownerId: rlsConfig.accounts.memberB.userId,
      },
      {
        label: "member B read member A",
        client: contexts?.memberB,
        ownerId: rlsConfig.accounts.memberA.userId,
      },
    ]) {
      expect(client).toBeDefined();
      for (const [table, ownerColumn] of privateTables) {
        const rows = await selectRows(
          client!,
          table,
          "id",
          [[ownerColumn, ownerId]],
          {
            allowDenied: true,
          },
        );
        expect(rows, `${label} rows from ${table}`).toHaveLength(0);
      }
    }
  });

  it("removes group visibility without deleting the removed member identity", async () => {
    const client = contexts?.removedMember;
    expect(client).toBeDefined();

    const visibleProfiles = ids(
      await selectRows(client!, "profiles", "id", [], { allowDenied: true }),
    );
    expect(visibleProfiles).not.toContain(rlsConfig.accounts.memberA.userId);
    expect(visibleProfiles).not.toContain(rlsConfig.accounts.memberB.userId);
    expect(visibleProfiles).not.toContain(rlsConfig.accounts.admin.userId);

    const visiblePosts = await selectRows(client!, "posts", "id", [], {
      allowDenied: true,
    });
    expect(visiblePosts).toHaveLength(0);
  });

  it("allows admin reads without exposing removed members as active group rows", async () => {
    const client = contexts?.admin;
    expect(client).toBeDefined();

    const visibleProfiles = ids(await selectRows(client!, "profiles", "id"));
    expect(visibleProfiles).toEqual(
      expect.arrayContaining([
        rlsConfig.accounts.admin.userId,
        rlsConfig.accounts.memberA.userId,
        rlsConfig.accounts.memberB.userId,
      ]),
    );
    expect(visibleProfiles).not.toContain(
      rlsConfig.accounts.removedMember.userId,
    );

    await invokeRpc(client!, "get_board", {
      viewer_id: rlsConfig.accounts.admin.userId,
    });
  });

  it("rejects cross-owner writes and direct day writes from admin", async () => {
    const memberA = contexts?.memberA;
    const admin = contexts?.admin;
    expect(memberA).toBeDefined();
    expect(admin).toBeDefined();

    const privateWrite = await memberA!.from("optional_goals").insert({
      owner_id: rlsConfig.accounts.memberB.userId,
      name: "W8 forbidden write probe",
      target_value: null,
      unit: null,
    });
    expect(privateWrite.error).not.toBeNull();
    expect(privateWrite.error?.code).not.toBe("42P01");

    const profileWrite = await memberA!
      .from("profiles")
      .update({
        display_name: "W8 forbidden profile probe",
      })
      .eq("id", rlsConfig.accounts.memberB.userId)
      .select("id");
    expect(profileWrite.error?.code).not.toBe("42P01");
    expect(profileWrite.data ?? []).toHaveLength(0);

    const memberDayWrite = await memberA!.from("day_deltas").insert({
      user_id: rlsConfig.accounts.memberB.userId,
      local_date: "2026-09-01",
      goal_key: "workout",
      amount_int: 1,
      source: "quiet",
      client_operation_id: crypto.randomUUID(),
    });
    expect(memberDayWrite.error).not.toBeNull();
    expect(memberDayWrite.error?.code).not.toBe("42P01");

    const adminDayWrite = await admin!.from("day_deltas").insert({
      user_id: rlsConfig.accounts.memberB.userId,
      local_date: "2026-09-01",
      goal_key: "workout",
      amount_int: 1,
      source: "quiet",
      client_operation_id: crypto.randomUUID(),
    });
    expect(adminDayWrite.error).not.toBeNull();
    expect(adminDayWrite.error?.code).not.toBe("42P01");

    const memberBPost = records(
      await selectRows(admin!, "posts", "id", [
        ["author_id", rlsConfig.accounts.memberB.userId],
        ["status", "published"],
      ]),
    )[0]?.id;
    if (typeof memberBPost === "string") {
      const postWrite = await memberA!
        .from("posts")
        .update({ note: "W8 forbidden post probe" })
        .eq("id", memberBPost)
        .select("id");
      expect(postWrite.error?.code).not.toBe("42P01");
      expect(postWrite.data ?? []).toHaveLength(0);

      const memberBReaction = records(
        await selectRows(admin!, "reactions", "post_id,user_id", [
          ["post_id", memberBPost],
          ["user_id", rlsConfig.accounts.memberB.userId],
        ]),
      )[0];
      if (
        typeof memberBReaction?.post_id === "string" &&
        typeof memberBReaction.user_id === "string"
      ) {
        const reactionWrite = await memberA!
          .from("reactions")
          .update({ emoji: "👍" })
          .eq("post_id", memberBReaction.post_id)
          .eq("user_id", memberBReaction.user_id)
          .select("post_id");
        expect(reactionWrite.error?.code).not.toBe("42P01");
        expect(reactionWrite.data ?? []).toHaveLength(0);
      }
    }

    const memberBComment = records(
      await selectRows(admin!, "comments", "id,author_id", [
        ["author_id", rlsConfig.accounts.memberB.userId],
      ]),
    )[0]?.id;
    if (typeof memberBComment === "string") {
      const commentDelete = await memberA!
        .from("comments")
        .delete()
        .eq("id", memberBComment)
        .select("id");
      expect(commentDelete.error?.code).not.toBe("42P01");
      expect(commentDelete.data ?? []).toHaveLength(0);
    }
  });

  it("does not allow anonymous or another member to sign private media", async () => {
    const path = `posts/${rlsConfig.accounts.memberA.userId}/w8-probe/photo.png`;

    const anonymousResult = await contexts!.anonymous.storage
      .from("post-photos")
      .createSignedUrl(path, 60);
    expect(anonymousResult.error).not.toBeNull();
    expect(anonymousResult.error?.message).not.toMatch(/bucket not found/i);

    const memberBResult = await contexts!.memberB.storage
      .from("post-photos")
      .createSignedUrl(path, 60);
    expect(memberBResult.error).not.toBeNull();
    expect(memberBResult.error?.message).not.toMatch(/bucket not found/i);
  });
});
