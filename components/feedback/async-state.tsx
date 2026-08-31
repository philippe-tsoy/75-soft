import { Button } from "@/components/ui";

export function Skeleton({ className = "h-20" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`bg-surface-accent animate-pulse rounded-2xl ${className}`}
    />
  );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      aria-live="polite"
      className="border-border bg-card text-muted rounded-2xl border p-6 text-center text-sm"
    >
      {label}
    </div>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="border-border bg-card text-muted rounded-2xl border border-dashed p-6 text-center text-sm">
      {message}
    </div>
  );
}

export function UnauthorizedState({
  message = "You do not have access to this group.",
}: {
  message?: string;
}) {
  return (
    <div className="border-border bg-card text-muted rounded-2xl border p-6 text-center text-sm">
      {message}
    </div>
  );
}

export function MutationStatus({
  state,
}: {
  state: "idle" | "pending" | "success" | "error";
}) {
  if (state === "idle") {
    return null;
  }

  const message = {
    pending: "Saving…",
    success: "Saved",
    error: "Could not save. Try again.",
  }[state];

  return (
    <p
      aria-live={state === "error" ? "assertive" : "polite"}
      className={
        state === "error" ? "text-sm text-red-700" : "text-muted text-sm"
      }
      role={state === "error" ? "alert" : "status"}
    >
      {message}
    </p>
  );
}

export function ErrorState({
  message = "Something went wrong.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      aria-live="assertive"
      className="space-y-3 rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-900"
    >
      <p>{message}</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}
