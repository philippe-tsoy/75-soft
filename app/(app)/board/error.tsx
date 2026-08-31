"use client";

import { ErrorState } from "@/components/feedback/async-state";

export default function BoardError({ reset }: { reset: () => void }) {
  return (
    <div className="py-6">
      <ErrorState message="The Board could not be loaded." onRetry={reset} />
    </div>
  );
}
