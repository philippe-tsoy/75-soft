import { LoadingState } from "@/components/feedback/async-state";

export default function StatsLoading() {
  return (
    <div className="py-6">
      <LoadingState label="Loading your stats…" />
    </div>
  );
}
