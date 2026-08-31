"use client";

import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";

import { EmptyState, ErrorState, LoadingState } from "@/components/feedback";
import { Button } from "@/components/ui";
import { DEFAULT_REACTION_PALETTE } from "@/lib/config/75-soft";
import { queryKeys } from "@/lib/query-keys";
import type { OptionalGoalDTO, PostDTO } from "@/lib/types";

import { PostCard } from "./post-card";
import { PostComposer } from "./post-composer";

interface FeedScreenProps {
  optionalGoals: OptionalGoalDTO[];
}

interface FeedResponse {
  data: PostDTO[];
  nextCursor: string | null;
}

interface ErrorResponse {
  error?: {
    message?: string;
  };
}

async function fetchFeedPage(cursor: string | null): Promise<FeedResponse> {
  const query = new URLSearchParams({ limit: "20" });
  if (cursor) {
    query.set("cursor", cursor);
  }

  const response = await fetch(`/api/feed?${query.toString()}`);
  const payload = (await response.json().catch(() => null)) as
    FeedResponse | ErrorResponse | null;
  if (!response.ok) {
    throw new Error(
      (payload as ErrorResponse | null)?.error?.message ??
        "Unable to load the feed.",
    );
  }

  return payload as FeedResponse;
}

async function fetchReactionPalette(): Promise<string[]> {
  const response = await fetch("/api/profile/reactions");
  const payload = (await response.json().catch(() => null)) as
    { data?: { emoji?: string[] } } | ErrorResponse | null;
  if (!response.ok) {
    throw new Error(
      (payload as ErrorResponse | null)?.error?.message ??
        "Unable to load reaction palette.",
    );
  }

  const data = (payload as { data?: { emoji?: string[] } } | null)?.data;
  return data?.emoji ?? [...DEFAULT_REACTION_PALETTE];
}

export function FeedScreen({ optionalGoals }: FeedScreenProps) {
  const queryClient = useQueryClient();
  const [composerOpen, setComposerOpen] = useState(false);
  const feedQuery = useInfiniteQuery({
    queryKey: queryKeys.feed(null),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchFeedPage(pageParam),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
  const paletteQuery = useQuery({
    queryKey: ["profile", "reaction-palette"],
    queryFn: fetchReactionPalette,
    initialData: [...DEFAULT_REACTION_PALETTE],
  });

  const posts = feedQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const invalidateFeed = () => {
    void queryClient.invalidateQueries({ queryKey: ["feed"] });
  };

  return (
    <div className="space-y-5 py-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-semibold tracking-wide">
            Community
          </p>
          <h1 className="text-2xl font-semibold">Feed</h1>
          <p className="text-muted mt-1 text-sm">
            Post updates are the only items shared with the group.
          </p>
        </div>
        <Button className="shrink-0" onClick={() => setComposerOpen(true)}>
          Post update
        </Button>
      </div>

      {feedQuery.isPending ? <LoadingState label="Loading feed…" /> : null}
      {feedQuery.isError ? (
        <ErrorState
          message={feedQuery.error.message}
          onRetry={() => void feedQuery.refetch()}
        />
      ) : null}
      {!feedQuery.isPending && !feedQuery.isError && posts.length === 0 ? (
        <EmptyState message="No posts yet." />
      ) : null}

      {posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              onChanged={invalidateFeed}
              onDeleted={invalidateFeed}
              post={post}
              reactionPalette={paletteQuery.data}
            />
          ))}
        </div>
      ) : null}

      {feedQuery.hasNextPage ? (
        <Button
          className="w-full"
          disabled={feedQuery.isFetchingNextPage}
          onClick={() => void feedQuery.fetchNextPage()}
          variant="secondary"
        >
          {feedQuery.isFetchingNextPage ? "Loading more…" : "Load more"}
        </Button>
      ) : null}

      <PostComposer
        onClose={() => setComposerOpen(false)}
        onPosted={invalidateFeed}
        open={composerOpen}
        optionalGoals={optionalGoals}
      />
    </div>
  );
}
