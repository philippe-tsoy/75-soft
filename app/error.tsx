"use client";

import { Button } from "@/components/ui";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-muted text-sm">
          Please try again. If the problem continues, contact your group
          administrator.
        </p>
        <Button onClick={reset}>Try again</Button>
      </div>
    </main>
  );
}
