import { describe, expect, it } from "vitest";

import {
  decodeFeedCursor,
  encodeFeedCursor,
  parseFeedLimit,
  parsePostForm,
  resolvePostLocalDate,
  summarizeReactions,
  toPostGoalDTO,
} from "@/features/feed";
import {
  MAX_POST_PHOTO_BYTES,
  POST_PHOTO_MIME_TYPES,
} from "@/lib/config/75-soft";

describe("W3 feed contracts", () => {
  it("uses an opaque created-at/id cursor and clamps safe limits", () => {
    const cursor = {
      createdAt: "2026-09-01T12:00:00.000Z",
      id: "00000000-0000-0000-0000-000000000001",
    };
    const encoded = encodeFeedCursor(cursor);

    expect(encoded).not.toContain("createdAt");
    expect(decodeFeedCursor(encoded)).toEqual(cursor);
    expect(parseFeedLimit(null)).toBe(20);
    expect(parseFeedLimit("50")).toBe(50);
    expect(parseFeedLimit("500")).toBe(50);
    expect(() => decodeFeedCursor("not-a-cursor")).toThrow();
    expect(() => parseFeedLimit("0")).toThrow();
  });

  it("parses multipart post input with a required operation id", () => {
    const operationId = "00000000-0000-0000-0000-000000000010";
    const formData = new FormData();
    formData.set("localDate", "today");
    formData.set(
      "goals",
      JSON.stringify([{ kind: "required", key: "workout", amount: 45 }]),
    );
    formData.set("note", "  Strong finish  ");
    formData.set("clientOperationId", operationId);
    formData.set(
      "photo",
      new File(["photo"], "update.png", { type: "image/png" }),
    );

    const parsed = parsePostForm(
      new Request("http://localhost/api/posts", {
        headers: {
          "x-client-operation-id": operationId,
        },
      }),
      formData,
    );

    expect(parsed.clientOperationId).toBe(operationId);
    expect(parsed.note).toBe("Strong finish");
    expect(parsed.goals).toHaveLength(1);
    expect(parsed.photo?.type).toBe("image/png");
  });

  it("keeps the submitted date inside the member-local edit window", () => {
    expect(resolvePostLocalDate("yesterday", "2026-09-02", "2026-09-01")).toBe(
      "2026-09-01",
    );
    expect(() =>
      resolvePostLocalDate("2026-09-01", "2026-09-03", "2026-09-01"),
    ).toThrow();
    expect(() =>
      resolvePostLocalDate("2026-08-31", "2026-09-01", "2026-09-01"),
    ).toThrow();
  });

  it("maps optional-only entries without exposing private goal sources", () => {
    const goal = toPostGoalDTO({
      id: "00000000-0000-0000-0000-000000000020",
      post_id: "00000000-0000-0000-0000-000000000021",
      required_goal_key: null,
      optional_goal_id: "00000000-0000-0000-0000-000000000022",
      optional_goal_name: "Meditate",
      amount_int: null,
      diet_value: null,
      optional_value: 10,
      optional_completed: null,
      created_at: "2026-09-01T12:00:00.000Z",
    });

    expect(goal).toEqual({
      kind: "optional",
      optionalGoalId: "00000000-0000-0000-0000-000000000022",
      name: "Meditate",
      value: 10,
      completed: null,
    });
    expect(JSON.stringify(goal)).not.toContain("owner_id");
  });

  it("orders reaction summaries by the current palette", () => {
    expect(
      summarizeReactions(
        [
          {
            post_id: "post",
            user_id: "other",
            emoji: "🔥",
            created_at: "",
            updated_at: "",
          },
          {
            post_id: "post",
            user_id: "viewer",
            emoji: "👍",
            created_at: "",
            updated_at: "",
          },
          {
            post_id: "post",
            user_id: "other",
            emoji: "👍",
            created_at: "",
            updated_at: "",
          },
        ],
        ["👍", "🔥"],
        "viewer",
      ),
    ).toEqual([
      { emoji: "👍", count: 2, reactedByViewer: true },
      { emoji: "🔥", count: 1, reactedByViewer: false },
    ]);
  });

  it("uses the frozen server media boundary", () => {
    const formData = new FormData();
    formData.set("localDate", "today");
    formData.set("goals", JSON.stringify([{ kind: "required", key: "diet" }]));
    formData.set(
      "photo",
      new File([new Uint8Array(MAX_POST_PHOTO_BYTES + 1)], "too-big.png", {
        type: POST_PHOTO_MIME_TYPES[1],
      }),
    );

    expect(() =>
      parsePostForm(
        new Request("http://localhost/api/posts", {
          headers: {
            "x-client-operation-id": "00000000-0000-0000-0000-000000000011",
          },
        }),
        formData,
      ),
    ).toThrow(/5 MB/i);
  });
});
