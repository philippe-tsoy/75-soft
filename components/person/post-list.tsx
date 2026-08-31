import { EmptyState } from "@/components/feedback/async-state";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import { REQUIRED_GOALS } from "@/lib/config/75-soft";
import type { PostDTO } from "@/lib/types";

interface PostListProps {
  posts: PostDTO[];
}

function goalLabel(goal: PostDTO["goals"][number]): string {
  if (goal.kind === "required") {
    return REQUIRED_GOALS[goal.key].label;
  }

  return goal.name;
}

export function PostList({ posts }: PostListProps) {
  return (
    <Card aria-labelledby="person-posts-title">
      <CardHeader>
        <CardTitle id="person-posts-title">Posts</CardTitle>
        <p className="text-muted text-sm">
          Published updates from this member.
        </p>
      </CardHeader>

      {posts.length === 0 ? (
        <EmptyState message="No posts yet." />
      ) : (
        <div className="space-y-3" role="list" aria-label="Published posts">
          {posts.map((post) => (
            <article
              className="border-border rounded-xl border p-4"
              key={post.id}
              role="listitem"
            >
              <div className="flex items-center justify-between gap-3">
                <time className="text-muted text-xs" dateTime={post.createdAt}>
                  {post.localDate}
                </time>
                <span className="text-muted text-xs">
                  {post.author.displayName}
                </span>
              </div>
              {post.note ? (
                <p className="mt-3 text-sm leading-6 whitespace-pre-wrap">
                  {post.note}
                </p>
              ) : null}
              {post.goals.length > 0 ? (
                <ul
                  className="mt-3 flex flex-wrap gap-2"
                  aria-label="Posted goals"
                >
                  {post.goals.map((goal, index) => (
                    <li
                      className="bg-surface-accent text-primary rounded-full px-2.5 py-1 text-xs font-semibold"
                      key={`${post.id}-${goal.kind}-${index}`}
                    >
                      {goalLabel(goal)}
                    </li>
                  ))}
                </ul>
              ) : null}
              {post.photoUrl ? (
                <div className="mt-3 overflow-hidden rounded-xl">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    alt={`Photo from ${post.author.displayName}`}
                    className="max-h-80 w-full object-cover"
                    src={post.photoUrl}
                  />
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </Card>
  );
}
