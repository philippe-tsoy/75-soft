"use client";

import { ErrorState } from "@/components/feedback/async-state";

export default function PersonError({ reset }: { reset: () => void }) {
  return (
    <div className="py-6">
      <ErrorState
        message="This Person view could not be loaded."
        onRetry={reset}
      />
    </div>
  );
}
