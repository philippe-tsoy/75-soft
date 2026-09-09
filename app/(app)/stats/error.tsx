"use client";

import { ErrorState } from "@/components/feedback/async-state";

export default function StatsError({ reset }: { reset: () => void }) {
  return (
    <div className="py-6">
      <ErrorState message="Your stats could not be loaded." onRetry={reset} />
    </div>
  );
}
