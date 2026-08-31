"use client";

import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

interface ToastProps {
  message: string;
  onDismiss: () => void;
  tone?: "default" | "success" | "error";
  durationMs?: number;
}

export function Toast({
  message,
  onDismiss,
  tone = "default",
  durationMs = 5_000,
}: ToastProps) {
  const onDismissRef = useRef(onDismiss);

  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    const timeout = window.setTimeout(() => onDismissRef.current(), durationMs);
    return () => window.clearTimeout(timeout);
  }, [durationMs]);

  return (
    <div
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={cn(
        "fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-4 rounded-2xl border p-4 text-sm shadow-lg",
        tone === "error"
          ? "border-red-200 bg-red-50 text-red-900"
          : tone === "success"
            ? "border-green-200 bg-green-50 text-green-900"
            : "border-border bg-card text-foreground",
      )}
      role={tone === "error" ? "alert" : "status"}
    >
      <p>{message}</p>
      <button
        aria-label="Dismiss notification"
        className="focus-visible:ring-primary min-h-11 min-w-11 rounded-lg text-lg leading-none hover:bg-black/5 focus-visible:ring-2"
        onClick={onDismiss}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
