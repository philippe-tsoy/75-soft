import { LoadingState } from "@/components/feedback/async-state";

export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl items-center px-4">
      <div className="w-full">
        <LoadingState label="Loading 75 Soft…" />
      </div>
    </main>
  );
}
