import { LoadingState } from "@/components/feedback/async-state";

export default function BoardLoading() {
  return (
    <div className="py-6">
      <LoadingState label="Loading today’s Board…" />
    </div>
  );
}
