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
import {
  COHORT_START_DATE,
  DEFAULT_REACTION_PALETTE,
  MAX_COMMENT_CHARACTERS,
  MAX_POST_PHOTO_BYTES,
  POST_PHOTO_MIME_TYPES,
  REQUIRED_GOAL_KEYS,
} from "@/lib/config/75-soft";
import {
  getYesterday,
  isEditableDate,
  isScoredCalendarDate,
} from "@/lib/dates";
import { calculateDailyBoardScore } from "@/lib/scoring";
import {
  buildPostPhotoPath,
  getImageExtension,
  validateImage,
} from "@/lib/storage";
import type {
  BoardEntryDTO,
  DayRollupDTO,
  PostDTO,
  ProfileDTO,
} from "@/lib/types";
import {
  commentBodySchema,
  containerInputSchema,
  displayNameSchema,
  normalizeWaterAmount,
  operationIdSchema,
  optionalGoalInputSchema,
  postGoalInputSchema,
  positiveAmountSchema,
  profileUpdateSchema,
  reactionPaletteSchema,
  requiredGoalKeySchema,
  timezoneSchema,
  waterAmountSchema,
} from "@/lib/validation";
import {
  allMetGoalStates,
  fixtureUsers,
  goldenScoringFixtures,
} from "@/tests/fixtures/75-soft";

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

  describe("request validation", () => {
    it("accepts only the canonical required goal keys", () => {
      expect(REQUIRED_GOAL_KEYS).toEqual([
        "workout",
        "water",
        "reading",
        "diet",
      ]);

      for (const key of REQUIRED_GOAL_KEYS) {
        expect(requiredGoalKeySchema.parse(key)).toBe(key);
      }

      expect(requiredGoalKeySchema.safeParse("optional").success).toBe(false);
      expect(requiredGoalKeySchema.safeParse("Workout").success).toBe(false);
    });

    it("rejects zero, negative, non-finite, and over-bound amounts", () => {
      for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(positiveAmountSchema.safeParse(amount).success).toBe(false);
      }
      expect(positiveAmountSchema.safeParse(1_000_000).success).toBe(true);
      expect(positiveAmountSchema.safeParse(1_000_001).success).toBe(false);

      expect(
        containerInputSchema.safeParse({
          label: "Bottle",
          volumeMl: 500,
        }).success,
      ).toBe(true);
      expect(
        containerInputSchema.safeParse({
          label: "Bottle",
          volumeMl: 0,
        }).success,
      ).toBe(false);
    });

    it("normalizes liters to integer milliliters and rejects unsafe results", () => {
      expect(waterAmountSchema.parse({ amount: 0.5, unit: "l" })).toEqual({
        amount: 0.5,
        unit: "l",
      });
      expect(normalizeWaterAmount(0.5, "l")).toBe(500);
      expect(normalizeWaterAmount(1, "l")).toBe(1_000);
      expect(normalizeWaterAmount(1_000, "ml")).toBe(1_000);
      expect(normalizeWaterAmount(2, "l")).toBe(2_000);

      expect(() => normalizeWaterAmount(0.0005, "l")).toThrow();
      expect(() => normalizeWaterAmount(Number.MAX_SAFE_INTEGER, "l")).toThrow();
      expect(
        waterAmountSchema.safeParse({ amount: 1, unit: "gallon" }).success,
      ).toBe(false);
    });

    it("validates date assertions against the member-local edit window", () => {
      expect(
        isEditableDate(
          goldenScoringFixtures.firstCohortDay.localDate,
          "2026-09-02",
          COHORT_START_DATE,
        ),
      ).toBe(true);
      expect(
        isEditableDate("2026-09-01", "2026-09-02", COHORT_START_DATE),
      ).toBe(true);
      expect(
        isEditableDate("2026-08-31", "2026-09-02", COHORT_START_DATE),
      ).toBe(false);
      expect(
        isEditableDate("2026-09-03", "2026-09-02", COHORT_START_DATE),
      ).toBe(false);
      expect(getYesterday("2026-09-02")).toBe("2026-09-01");
      expect(
        isScoredCalendarDate("2026-09-03", "2026-09-04", COHORT_START_DATE),
      ).toBe(false);
    });

    it("validates profile, timezone, reaction, and comment inputs", () => {
      expect(displayNameSchema.parse("  Alex  ")).toBe("Alex");
      expect(displayNameSchema.safeParse("   ").success).toBe(false);
      expect(profileUpdateSchema.parse({ timezone: "Asia/Tokyo" })).toEqual({
        timezone: "Asia/Tokyo",
      });
      expect(timezoneSchema.safeParse("Not/AZone").success).toBe(false);

      expect(reactionPaletteSchema.parse({ emoji: [...DEFAULT_REACTION_PALETTE] })).toEqual(
        {
          emoji: [...DEFAULT_REACTION_PALETTE],
        },
      );
      expect(
        reactionPaletteSchema.safeParse({ emoji: ["👍", "👍"] }).success,
      ).toBe(false);
      expect(
        reactionPaletteSchema.safeParse({ emoji: ["not-an-emoji"] }).success,
      ).toBe(false);

      const maxGraphemeComment = "💪".repeat(MAX_COMMENT_CHARACTERS);
      expect(commentBodySchema.parse(maxGraphemeComment)).toBe(
        maxGraphemeComment,
      );
      expect(
        commentBodySchema.safeParse(`${maxGraphemeComment}💪`).success,
      ).toBe(false);
      expect(commentBodySchema.parse("  Nice work!  ")).toBe("Nice work!");
    });

    it("accepts an empty selection and rejects required/duplicate/malformed post goals", () => {
      const optionalGoalId = "00000000-0000-0000-0000-000000000010";

      // Required-goal entries are no longer client-submittable -- the server
      // derives required state from the day's rollup instead, and a post is
      // never "empty" once its required snapshot and photo are attached. See
      // TEAMS_PERCENTAGE_AND_DAILY_PHOTO.md §4.6.
      expect(postGoalInputSchema.safeParse([]).success).toBe(true);
      expect(
        postGoalInputSchema.safeParse([
          {
            kind: "optional",
            optionalGoalId,
            completed: true,
          },
        ]).success,
      ).toBe(true);
      expect(
        postGoalInputSchema.safeParse([
          { kind: "required", key: "workout", amount: 30 },
        ]).success,
      ).toBe(false);
      expect(
        postGoalInputSchema.safeParse([
          { kind: "optional", optionalGoalId, completed: true },
          { kind: "optional", optionalGoalId, completed: false },
        ]).success,
      ).toBe(false);
      expect(
        postGoalInputSchema.safeParse([
          {
            kind: "optional",
            optionalGoalId,
            value: 10,
            completed: true,
          },
        ]).success,
      ).toBe(false);
      expect(
        postGoalInputSchema.safeParse([
          { kind: "optional", optionalGoalId },
        ]).success,
      ).toBe(false);
    });

    it("validates optional goal target pairs and ownership-independent shape", () => {
      expect(
        optionalGoalInputSchema.parse({
          name: "Meditate",
          targetValue: 10,
          unit: "minutes",
        }),
      ).toMatchObject({
        name: "Meditate",
        targetValue: 10,
        unit: "minutes",
      });
      expect(optionalGoalInputSchema.parse({ name: "Stretch" })).toEqual({
        name: "Stretch",
      });
      expect(
        optionalGoalInputSchema.safeParse({
          name: "Meditate",
          targetValue: 10,
        }).success,
      ).toBe(false);
    });
  });

  describe("upload contract", () => {
    it("accepts all supported MIME types at and below the exact byte limit", () => {
      for (const type of POST_PHOTO_MIME_TYPES) {
        expect(
          validateImage({ size: MAX_POST_PHOTO_BYTES, type }),
        ).toEqual({ valid: true });
        expect(validateImage({ size: 1, type })).toEqual({ valid: true });
      }
    });

    it("maps supported MIME types to matching private-path extensions", () => {
      expect(getImageExtension("image/jpeg")).toBe("jpeg");
      expect(getImageExtension("image/png")).toBe("png");
      expect(getImageExtension("image/webp")).toBe("webp");
      expect(() => getImageExtension("image/gif")).toThrow();

      expect(
        buildPostPhotoPath(
          fixtureUsers.memberA.id,
          "00000000-0000-0000-0000-000000000020",
          "upload-1",
          "png",
        ),
      ).toBe(
        `posts/${fixtureUsers.memberA.id}/00000000-0000-0000-0000-000000000020/upload-1.png`,
      );
    });

    it("rejects empty, unsupported, and over-limit payloads", () => {
      expect(validateImage(null)).toEqual({
        valid: false,
        error: "empty",
      });
      expect(validateImage({ size: 0, type: "image/png" })).toEqual({
        valid: false,
        error: "empty",
      });
      expect(validateImage({ size: 1, type: "image/gif" })).toEqual({
        valid: false,
        error: "unsupported_type",
      });
      expect(
        validateImage({
          size: MAX_POST_PHOTO_BYTES + 1,
          type: "image/jpeg",
        }),
      ).toEqual({
        valid: false,
        error: "too_large",
      });
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
        goals: {
          workout: { amount: 45, target: 45, met: true, unit: "minutes" },
          water: { amount: 2_000, target: 2_000, met: true, unit: "ml" },
          reading: { amount: 10, target: 10, met: true, unit: "pages" },
          diet: { met: true, target: 1, unit: "attestation" },
        },
        metCount: 4,
      } satisfies DayRollupDTO;
      const post = {
        id: "00000000-0000-0000-0000-000000000021",
        author: profile,
        localDate: COHORT_START_DATE,
        createdAt: "2026-09-01T12:00:00.000Z",
        goals: [
          {
            kind: "required",
            key: "workout",
            amount: 45,
            unit: "minutes",
            met: true,
          },
        ],
        note: null,
        photoUrl: null,
        requiredSnapshot: {
          workout: { amount: 45, met: true },
          water: { amount: 2_000, met: true },
          reading: { amount: 10, met: true },
          diet: { met: true },
        },
        teamId: null,
        reactions: [],
        comments: [],
        canDelete: true,
      } satisfies PostDTO;
      const boardEntry = {
        rank: 1,
        user: profile,
        goalsAchievedToday: 4,
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
        expect.objectContaining({
          workout: expect.any(Object),
          water: expect.any(Object),
          reading: expect.any(Object),
          diet: expect.any(Object),
        }),
      );
      expect(calculateDailyBoardScore({
        activeMember: true,
        localDate: COHORT_START_DATE,
        joinLocalDate: COHORT_START_DATE,
        goalStates: allMetGoalStates,
      }).goalsAchievedToday).toBe(4);
    });

    it("keeps dates date-only and instants UTC in DTO examples", () => {
      const dateOnly = /^\d{4}-\d{2}-\d{2}$/;
      const instant = /^\d{4}-\d{2}-\d{2}T.*Z$/;

      expect(dateOnly.test(COHORT_START_DATE)).toBe(true);
      expect(instant.test("2026-09-01T12:00:00.000Z")).toBe(true);
      expect(dateOnly.test(goldenScoringFixtures.firstCohortDay.localDate)).toBe(
        true,
      );
    });
  });
});
