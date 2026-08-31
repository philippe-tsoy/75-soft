import { LoadingState } from "@/components/feedback/async-state";

export default function PersonLoading() {
  return (
    <div className="py-6">
      <LoadingState label="Loading Person view…" />
    </div>
  );
}
