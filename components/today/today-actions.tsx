"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { PostComposer } from "@/components/feed/post-composer";
import {
  OptionalGoalsPanel,
  fetchOptionalGoals,
} from "@/components/optional-goals";
import { Button, Card, CardHeader, CardTitle } from "@/components/ui";
import type { ContainerDTO } from "@/lib/types";
import { queryKeys } from "@/lib/query-keys";

async function fetchContainers(): Promise<ContainerDTO[]> {
  const response = await fetch("/api/containers");
  const payload = (await response.json().catch(() => null)) as {
    data?: ContainerDTO[];
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new Error(
      payload?.error?.message ?? "Saved water containers are unavailable.",
    );
  }

  return payload?.data ?? [];
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
  const optionalGoalsQuery = useQuery({
    queryKey: queryKeys.optionalGoals("me"),
    queryFn: fetchOptionalGoals,
  });
  const containersQuery = useQuery({
    queryKey: queryKeys.containers("me"),
    queryFn: fetchContainers,
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
      queryKey: queryKeys.achievements(userId),
    });
    router.refresh();
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Keep your day moving</CardTitle>
          <p className="text-muted mt-1 text-sm">
            Log quietly here, or share a progress update with the group.
          </p>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setComposerOpen(true)}>Post update</Button>
          <Link
            className="border-border bg-card text-foreground hover:bg-surface-accent focus-visible:ring-primary inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            href="/yesterday"
          >
            Review yesterday
          </Link>
        </div>
      </Card>

      <OptionalGoalsPanel localDate={localDate} />

      <PostComposer
        onClose={() => setComposerOpen(false)}
        onPosted={handlePosted}
        open={composerOpen}
        optionalGoals={optionalGoalsQuery.data ?? []}
        containers={containersQuery.data ?? []}
        allowYesterday={allowYesterday}
      />
    </>
  );
}
