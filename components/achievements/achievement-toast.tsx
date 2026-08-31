"use client";

import { Toast } from "@/components/feedback";

import type { AchievementDTO } from "@/lib/types";

type AchievementToastValue = Pick<AchievementDTO, "title" | "description">;

export interface AchievementToastProps {
  toast: AchievementToastValue | null;
  onDismiss: () => void;
}

export function AchievementToast({ toast, onDismiss }: AchievementToastProps) {
  if (!toast) {
    return null;
  }

  return (
    <Toast
      message={`${toast.title} unlocked — ${toast.description}`}
      onDismiss={onDismiss}
      tone="success"
    />
  );
}
