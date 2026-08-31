"use client";

import { useCallback, useState } from "react";

import type { OptionalGoalStreakToastDTO } from "@/features/optional-goals/types";

export function useOptionalGoalStreakToast() {
  const [streakToast, setStreakToast] =
    useState<OptionalGoalStreakToastDTO | null>(null);

  const showStreakToast = useCallback(
    (nextToast: OptionalGoalStreakToastDTO | null) => {
      setStreakToast(nextToast);
    },
    [],
  );

  const dismissStreakToast = useCallback(() => {
    setStreakToast(null);
  }, []);

  return {
    streakToast,
    showStreakToast,
    dismissStreakToast,
  };
}
