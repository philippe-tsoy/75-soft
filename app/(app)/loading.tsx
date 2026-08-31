import { Skeleton } from "@/components/feedback";

export default function AppLoading() {
  return (
    <div
      aria-label="Loading page"
      className="space-y-4 py-6"
      role="status"
    >
      <span className="sr-only">Loading page…</span>
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-48 w-full" />
      <Skeleton className="h-32 w-full" />
    </div>
  );
}
