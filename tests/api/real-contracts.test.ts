import { describe, expect, it } from "vitest";

import {
  apiConfigurationMessage,
  apiRequest,
  apiTestConfig,
  assertNoPrivateResponseFields,
  jsonRequestBody,
  readResponseBody,
} from "./support";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown, label: string): JsonRecord {
  expect(value, `${label} must be a JSON object`).toBeTypeOf("object");
  expect(value, `${label} must not be null`).not.toBeNull();
  return value as JsonRecord;
}

async function expectError(
  response: Response,
  status: number,
  code: string,
): Promise<JsonRecord> {
  const body = await readResponseBody(response);
  expect(response.status).toBe(status);
  assertNoPrivateResponseFields(body);

  const error = asRecord(asRecord(body, "error response").error, "error");
  expect(error.code).toBe(code);
  expect(error.message).toBeTypeOf("string");
  return error;
}

async function expectData(response: Response): Promise<unknown> {
  const body = await readResponseBody(response);
  expect(response.ok).toBe(true);
  assertNoPrivateResponseFields(body);
  return asRecord(body, "success response").data;
}

function operationHeaders(operationId: string): Headers {
  return new Headers({
    "content-type": "application/json",
    "x-client-operation-id": operationId,
  });
}

function formOperationHeaders(operationId: string): Headers {
  return new Headers({ "x-client-operation-id": operationId });
}

function mutationDateOrSkip(): string {
  if (!apiTestConfig.mutationDate) {
    throw new Error(
      "[W8 API] Set W8_API_TEST_LOCAL_DATE to an eligible today/yesterday date for mutation-contract checks.",
    );
  }

  return apiTestConfig.mutationDate;
}

describe("W8 real API request contracts", () => {
  if (apiTestConfig.missing.length > 0) {
    it.skip(apiConfigurationMessage, () => undefined);
    return;
  }

  describe("auth, validation, and stable errors", () => {
    it("returns the anonymous session state without a secret-bearing error", async () => {
      const data = asRecord(
        await expectData(await apiRequest("/api/auth/session")),
        "session data",
      );

      expect(data.authenticated).toBe(false);
      expect(data.member).toBe(false);
      expect(data.user).toBeNull();
      expect(data.role).toBeNull();
    });

    it("requires a session for private profile reads", async () => {
      await expectError(await apiRequest("/api/profile"), 401, "AUTH_REQUIRED");
    });

    it("maps malformed JSON and unknown goal input to validation errors", async () => {
      const malformed = await apiRequest(
        `/api/day/${mutationDateOrSkip()}/entries`,
        {
          method: "POST",
          body: "{",
          headers: operationHeaders(crypto.randomUUID()),
        },
        apiTestConfig.memberCookie,
      );
      await expectError(malformed, 400, "VALIDATION_ERROR");

      const operationId = crypto.randomUUID();
      const unknownGoal = await apiRequest(
        `/api/day/${mutationDateOrSkip()}/entries`,
        {
          method: "POST",
          body: JSON.stringify({
            goal: "unknown",
            amount: 0,
            clientOperationId: operationId,
          }),
          headers: operationHeaders(operationId),
        },
        apiTestConfig.memberCookie,
      );
      await expectError(unknownGoal, 400, "VALIDATION_ERROR");
    });

    it("rejects dates outside the editable window with a business error", async () => {
      const operationId = crypto.randomUUID();
      const response = await apiRequest(
        "/api/day/2026-08-31/entries",
        {
          method: "POST",
          body: JSON.stringify({
            goal: "workout",
            amount: 1,
            clientOperationId: operationId,
          }),
          headers: operationHeaders(operationId),
        },
        apiTestConfig.memberCookie,
      );

      await expectError(response, 422, "BUSINESS_RULE_VIOLATION");
    });

    it("forbids members from calling admin endpoints", async () => {
      await expectError(
        await apiRequest("/api/admin/members", {}, apiTestConfig.memberCookie),
        403,
        "FORBIDDEN",
      );
    });
  });

  describe("DTO and privacy boundaries", () => {
    it("returns private profile data only in the documented envelope", async () => {
      const data = asRecord(
        await expectData(
          await apiRequest("/api/profile", {}, apiTestConfig.memberCookie),
        ),
        "profile data",
      );

      expect(data).toHaveProperty("id");
      expect(data).toHaveProperty("displayName");
      expect(data).toHaveProperty("avatarUrl");
      expect(data).toHaveProperty("timezone");
    });

    it("keeps day, feed, and board responses in public DTO shapes", async () => {
      const date = mutationDateOrSkip();
      const day = asRecord(
        await expectData(
          await apiRequest(`/api/day/${date}`, {}, apiTestConfig.memberCookie),
        ),
        "day data",
      );
      expect(day).toMatchObject({
        localDate: date,
        goals: expect.objectContaining({
          workout: expect.any(Object),
          water: expect.any(Object),
          reading: expect.any(Object),
          diet: expect.any(Object),
        }),
      });

      const feedResponse = await apiRequest(
        "/api/feed?limit=1",
        {},
        apiTestConfig.memberCookie,
      );
      const feedBody = asRecord(
        await readResponseBody(feedResponse),
        "feed response",
      );
      expect(feedResponse.ok).toBe(true);
      expect(feedBody.data).toBeInstanceOf(Array);
      expect(feedBody).toHaveProperty("nextCursor");
      assertNoPrivateResponseFields(feedBody);

      const boardBody = asRecord(
        await readResponseBody(
          await apiRequest("/api/board", {}, apiTestConfig.memberCookie),
        ),
        "board response",
      );
      expect(boardBody.data).toBeInstanceOf(Array);
      assertNoPrivateResponseFields(boardBody);
    });

    it("does not expose private implementation fields from admin DTOs", async () => {
      const data = await expectData(
        await apiRequest("/api/admin/members", {}, apiTestConfig.adminCookie),
      );
      assertNoPrivateResponseFields(data);
      expect(JSON.stringify(data)).not.toMatch(
        /optional goals|raw day events|service role/i,
      );
    });
  });

  describe("media limits and post validation", () => {
    it("rejects an empty post goal list before publication", async () => {
      const form = new FormData();
      const operationId = crypto.randomUUID();
      form.set("localDate", mutationDateOrSkip());
      form.set("goals", "[]");
      form.set("clientOperationId", operationId);

      await expectError(
        await apiRequest(
          "/api/posts",
          {
            method: "POST",
            body: form,
            headers: formOperationHeaders(operationId),
          },
          apiTestConfig.memberCookie,
        ),
        400,
        "VALIDATION_ERROR",
      );
    });

    it("maps unsupported media and payloads over 5 MB to stable errors", async () => {
      const unsupported = new FormData();
      const unsupportedOperationId = crypto.randomUUID();
      unsupported.set("localDate", mutationDateOrSkip());
      unsupported.set(
        "goals",
        JSON.stringify([{ kind: "required", key: "diet" }]),
      );
      unsupported.set("clientOperationId", unsupportedOperationId);
      unsupported.set(
        "photo",
        new Blob(["not an image"], { type: "image/gif" }),
        "photo.gif",
      );

      await expectError(
        await apiRequest(
          "/api/posts",
          {
            method: "POST",
            body: unsupported,
            headers: formOperationHeaders(unsupportedOperationId),
          },
          apiTestConfig.memberCookie,
        ),
        415,
        "UNSUPPORTED_MEDIA_TYPE",
      );

      const oversized = new FormData();
      const oversizedOperationId = crypto.randomUUID();
      oversized.set("localDate", mutationDateOrSkip());
      oversized.set(
        "goals",
        JSON.stringify([{ kind: "required", key: "diet" }]),
      );
      oversized.set("clientOperationId", oversizedOperationId);
      oversized.set(
        "photo",
        new Blob([new Uint8Array(5_000_001)], { type: "image/png" }),
        "photo.png",
      );

      await expectError(
        await apiRequest(
          "/api/posts",
          {
            method: "POST",
            body: oversized,
            headers: formOperationHeaders(oversizedOperationId),
          },
          apiTestConfig.memberCookie,
        ),
        413,
        "PAYLOAD_TOO_LARGE",
      );
    });
  });

  describe("idempotent mutations", () => {
    it.skipIf(!apiTestConfig.mutationDate)(
      "returns the original delta for a retried amount mutation",
      async () => {
        const operationId = crypto.randomUUID();
        const body = JSON.stringify({
          goal: "workout",
          amount: 1,
          clientOperationId: operationId,
        });
        const init = {
          method: "POST",
          body,
          headers: operationHeaders(operationId),
        } satisfies RequestInit;

        const first = asRecord(
          await expectData(
            await apiRequest(
              `/api/day/${mutationDateOrSkip()}/entries`,
              init,
              apiTestConfig.memberCookie,
            ),
          ),
          "first mutation",
        );
        const second = asRecord(
          await expectData(
            await apiRequest(
              `/api/day/${mutationDateOrSkip()}/entries`,
              init,
              apiTestConfig.memberCookie,
            ),
          ),
          "retry mutation",
        );

        expect(first.deltaId).toBeTypeOf("string");
        expect(second.deltaId).toBe(first.deltaId);
      },
    );
  });

  describe("error recovery and operation-id boundary", () => {
    it("rejects a mutation without the retry operation header", async () => {
      const body = jsonRequestBody({
        goal: "workout",
        amount: 1,
        clientOperationId: crypto.randomUUID(),
      });

      await expectError(
        await apiRequest(
          `/api/day/${mutationDateOrSkip()}/entries`,
          { method: "POST", body: body.body, headers: body.headers },
          apiTestConfig.memberCookie,
        ),
        400,
        "CLIENT_OPERATION_ID_REQUIRED",
      );
    });
  });
});
