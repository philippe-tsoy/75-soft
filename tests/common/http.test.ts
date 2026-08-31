import { describe, expect, it } from "vitest";

import { fail, ok, paginated } from "@/lib/http";

describe("common HTTP helpers", () => {
  it("wraps successful responses in the shared data envelope", async () => {
    const response = ok({ ready: true });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { ready: true } });
  });

  it("keeps pagination metadata beside the data array", async () => {
    const response = paginated([{ id: "one" }], "cursor-2");

    expect(await response.json()).toEqual({
      data: [{ id: "one" }],
      nextCursor: "cursor-2",
    });
  });

  it("serializes stable error codes", async () => {
    const response = fail(422, "VALIDATION_ERROR", "Invalid value", {
      field: "amount",
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid value",
        details: { field: "amount" },
      },
    });
  });
});
