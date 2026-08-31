"use client";

import { useQuery } from "@tanstack/react-query";

import { queryKeys } from "@/lib/query-keys";

import type { AchievementResponseDTO } from "@/features/achievements/types";

interface AchievementApiResponse {
  data?: AchievementResponseDTO;
  error?: {
    message?: string;
  };
}

async function readAchievementResponse(
  response: Response,
): Promise<AchievementResponseDTO> {
  const body = (await response.json()) as AchievementApiResponse;

  if (!response.ok || !body.data) {
    throw new Error(body.error?.message ?? "Unable to load achievements");
  }

  return body.data;
}

export async function fetchAchievements(): Promise<AchievementResponseDTO> {
  const response = await fetch("/api/achievements", {
    headers: { accept: "application/json" },
  });

  return readAchievementResponse(response);
}

export async function evaluateAchievementsFromAction(
  clientOperationId?: string,
): Promise<AchievementResponseDTO> {
  const response = await fetch("/api/achievements", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(clientOperationId ? { clientOperationId } : {}),
  });

  return readAchievementResponse(response);
}

export function useAchievements(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.achievements(userId ?? "me"),
    queryFn: fetchAchievements,
    enabled: userId !== null,
  });
}
