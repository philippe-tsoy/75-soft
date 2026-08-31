import type { DayRollupDTO } from "@/lib/types";

import type { FeedClient } from "./database";
import type { FeedScoringAdapter } from "./types";

type RpcResult = {
  data: unknown;
  error: unknown;
};

type RpcInvoker = {
  rpc(functionName: string, args: Record<string, unknown>): Promise<RpcResult>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asDayRollup(value: unknown): DayRollupDTO | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!isRecord(candidate) || !isRecord(candidate.goals)) {
    return null;
  }

  const goals = candidate.goals;
  const localDate = candidate.localDate ?? candidate.local_date;
  const dayNumber = candidate.dayNumber ?? candidate.day_number;
  const status = candidate.status;
  const editable = candidate.editable;
  const invalidated = candidate.invalidated;
  const metCount = candidate.metCount ?? candidate.met_count;

  if (
    typeof localDate !== "string" ||
    typeof dayNumber !== "number" ||
    typeof status !== "string" ||
    typeof editable !== "boolean" ||
    typeof invalidated !== "boolean" ||
    typeof metCount !== "number" ||
    !isRecord(goals.workout) ||
    !isRecord(goals.water) ||
    !isRecord(goals.reading) ||
    !isRecord(goals.diet)
  ) {
    return null;
  }

  return {
    localDate,
    dayNumber,
    status: status as DayRollupDTO["status"],
    editable,
    invalidated,
    goals: {
      workout: goals.workout as unknown as DayRollupDTO["goals"]["workout"],
      water: goals.water as unknown as DayRollupDTO["goals"]["water"],
      reading: goals.reading as unknown as DayRollupDTO["goals"]["reading"],
      diet: goals.diet as unknown as DayRollupDTO["goals"]["diet"],
    },
    metCount,
  };
}

async function invokeRpc(
  client: FeedClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<RpcResult> {
  return (await (client as unknown as RpcInvoker).rpc(
    functionName,
    args,
  )) as RpcResult;
}

export const noOpFeedScoringAdapter: FeedScoringAdapter = {
  async getDayRollup() {
    return null;
  },
  async afterPostPublished() {
    return [];
  },
  async afterPostDeleted() {},
};

/**
 * W2 owns rollup calculations. This adapter only asks its published RPC for a
 * fresh result and deliberately performs no scoring locally. Until W2's RPC is
 * present, the post API returns `day: null` and remains otherwise usable.
 */
export function createFeedScoringAdapter(
  client: FeedClient,
): FeedScoringAdapter {
  return {
    async getDayRollup(userId, localDate) {
      try {
        const result = await invokeRpc(client, "get_day_rollup", {
          p_user_id: userId,
          p_local_date: localDate,
        });
        if (result.error) {
          return null;
        }
        return asDayRollup(result.data);
      } catch {
        return null;
      }
    },
    async afterPostPublished() {
      // W6 achievement evaluation is intentionally not reimplemented here.
      return [];
    },
    async afterPostDeleted() {
      // Rollups derive from published entries, so deletion needs no counter
      // repair. The caller requests a fresh W2 rollup after this hook.
    },
  };
}

export type { FeedScoringAdapter };
