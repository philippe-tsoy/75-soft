"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PostComposer } from "@/components/feed/post-composer";
import { fetchGoals } from "@/components/goals";
import { queryKeys } from "@/lib/query-keys";

function PostIcon() {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height={24}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
      width={24}
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  );
}

export function TodayActions({
  localDate,
  userId,
  allowYesterday,
}: {
  localDate: string;
  userId: string;
  allowYesterday: boolean;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [composerOpen, setComposerOpen] = useState(false);
  const goalsQuery = useQuery({
    queryKey: queryKeys.goals("me"),
    queryFn: fetchGoals,
  });

  function handlePosted() {
    void queryClient.invalidateQueries({ queryKey: ["feed"] });
    void queryClient.invalidateQueries({ queryKey: ["group-strip"] });
    void queryClient.invalidateQueries({ queryKey: ["board"] });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.day(userId, localDate),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.person(userId) });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.achievements("me"),
    });
    router.refresh();
  }

  return (
    <>
      <button
        aria-label="Post an update"
        className="bg-primary text-primary-foreground focus-visible:ring-primary fixed right-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-transform outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-offset-2 active:scale-95"
        onClick={() => setComposerOpen(true)}
        type="button"
      >
        <PostIcon />
      </button>

      <PostComposer
        allowYesterday={allowYesterday}
        goals={goalsQuery.data ?? []}
        onClose={() => setComposerOpen(false)}
        onPosted={handlePosted}
        open={composerOpen}
        today={localDate}
        userId={userId}
      />
    </>
  );
}
