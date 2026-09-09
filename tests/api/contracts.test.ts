import { describe, expect, it } from "vitest";

import {
  API_ERROR_CODES,
  fail,
  handleRouteError,
  HttpError,
  noContent,
  ok,
  paginated,
} from "@/lib/http";
import {
  createClientOperationId,
  requireClientOperationId,
} from "@/lib/idempotency";
import { COHORT_START_DATE } from "@/lib/config/75-soft";
import { operationIdSchema } from "@/lib/validation";
import type {
  BoardEntryDTO,
  DayRollupDTO,
  PostDTO,
  ProfileDTO,
} from "@/lib/types";
import { fixtureUsers, goldenScoringFixtures } from "@/tests/fixtures/75-soft";

describe("API contract primitives", () => {
  describe("response envelopes and stable errors", () => {
    it("keeps successful and paginated response envelopes stable", async () => {
      expect(await ok({ ready: true }).json()).toEqual({
        data: { ready: true },
      });
      expect(ok({ ready: true }).status).toBe(200);

      expect(await ok({ created: true }, 201).json()).toEqual({
        data: { created: true },
      });
      expect(ok({ created: true }, 201).status).toBe(201);

      expect(await paginated([{ id: "post-1" }], null).json()).toEqual({
        data: [{ id: "post-1" }],
        nextCursor: null,
      });
      expect(await noContent().text()).toBe("");
      expect(noContent().status).toBe(204);
    });

    it("serializes every public error code without leaking implementation details", async () => {
      const expectedCodes = [
        "VALIDATION_ERROR",
        "AUTH_REQUIRED",
        "FORBIDDEN",
        "NOT_FOUND",
        "CONFLICT",
        "PAYLOAD_TOO_LARGE",
        "UNSUPPORTED_MEDIA_TYPE",
        "BUSINESS_RULE_VIOLATION",
        "RATE_LIMITED",
        "INTERNAL_ERROR",
      ] as const;

      expect(Object.values(API_ERROR_CODES)).toEqual(expectedCodes);

      for (const code of expectedCodes) {
        const response = fail(400, code, "Safe message", {
          field: "value",
        });

        expect(response.status).toBe(400);
        expect(await response.json()).toEqual({
          error: {
            code,
            message: "Safe message",
            details: { field: "value" },
          },
        });
      }

      const internalResponse = handleRouteError(
        new Error("database password and access_token must not escape"),
      );
      const internalBody = await internalResponse.json();

      expect(internalResponse.status).toBe(500);
      expect(internalBody).toEqual({
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong",
        },
      });
      expect(JSON.stringify(internalBody)).not.toMatch(
        /password|access_token|service.?role/i,
      );
    });

    it("maps HttpError instances to the declared status and code", async () => {
      const response = handleRouteError(
        new HttpError(422, "BUSINESS_RULE_VIOLATION", "Date is locked", {
          localDate: "2026-08-31",
        }),
      );

      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        error: {
          code: "BUSINESS_RULE_VIOLATION",
          message: "Date is locked",
          details: { localDate: "2026-08-31" },
        },
      });
    });
  });

  describe("mutation operation ids", () => {
    it("requires a UUID operation id at the retry boundary", () => {
      const operationId = createClientOperationId();
      const request = new Request("http://localhost/api/day", {
        headers: { "x-client-operation-id": operationId },
      });

      expect(requireClientOperationId(request)).toBe(operationId);
      expect(operationIdSchema.safeParse(operationId).success).toBe(true);
    });

    it("rejects missing and malformed operation ids with a stable client error", () => {
      for (const value of [undefined, "", "not-a-uuid"]) {
        const headers = new Headers();
        if (value !== undefined) {
          headers.set("x-client-operation-id", value);
        }

        expect(() =>
          requireClientOperationId(
            new Request("http://localhost/api/day", { headers }),
          ),
        ).toThrowError(
          expect.objectContaining({
            status: 400,
            code: "CLIENT_OPERATION_ID_REQUIRED",
          }),
        );
      }
    });
  });

  describe("DTO safety", () => {
    it("uses public camelCase DTO fields and never exposes raw/private sources", () => {
      const profile = {
        id: fixtureUsers.memberA.id,
        displayName: fixtureUsers.memberA.displayName,
        avatarUrl: null,
        timezone: fixtureUsers.memberA.timezone,
      } satisfies ProfileDTO;
      const day = {
        localDate: COHORT_START_DATE,
        dayNumber: 1,
        status: "complete",
        editable: true,
        invalidated: false,
        goals: [
          {
            id: "00000000-0000-0000-0000-000000000030",
            name: "Workout",
            isPrivate: false,
            amount: 45,
            target: 45,
            unit: "minutes",
            met: true,
          },
          {
            id: "00000000-0000-0000-0000-000000000031",
            name: "Secret goal",
            isPrivate: true,
            met: true,
          },
        ],
        metCount: 2,
        totalCount: 2,
      } satisfies DayRollupDTO;
      const post = {
        id: "00000000-0000-0000-0000-000000000021",
        author: profile,
        localDate: COHORT_START_DATE,
        createdAt: "2026-09-01T12:00:00.000Z",
        goals: [
          {
            goalId: "00000000-0000-0000-0000-000000000030",
            name: "Workout",
            amount: 45,
            met: true,
          },
        ],
        note: null,
        photoUrl: null,
        teamId: null,
        reactions: [],
        comments: [],
        canDelete: true,
      } satisfies PostDTO;
      const boardEntry = {
        rank: 1,
        user: profile,
        metCount: 2,
        totalCount: 2,
        scoreDate: COHORT_START_DATE,
      } satisfies BoardEntryDTO;

      for (const dto of [profile, day, post, boardEntry]) {
        const serialized = JSON.stringify(dto);
        expect(serialized).not.toMatch(
          /rawEvents|rawDayEvents|dayDeltas|optionalGoalLogs|privatePhotoPath|serviceRole|accessToken|snake_case/i,
        );
        expect(Object.keys(dto).every((key) => !key.includes("_"))).toBe(true);
      }

      expect(post.photoUrl).toBeNull();
      expect(day.goals).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: "Workout", isPrivate: false }),
          expect.objectContaining({ name: "Secret goal", isPrivate: true }),
        ]),
      );
    });

    it("keeps dates date-only and instants UTC in DTO examples", () => {
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
      const instant = /^\d{4}-\d{2}-\d{2}T.*Z$/;

      expect(dateOnly.test(COHORT_START_DATE)).toBe(true);
      expect(instant.test("2026-09-01T12:00:00.000Z")).toBe(true);
      expect(
        dateOnly.test(goldenScoringFixtures.firstCohortDay.localDate),
      ).toBe(true);
    });
  });
});
