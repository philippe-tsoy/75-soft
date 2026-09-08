import { EmptyState } from "@/components/feedback/async-state";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import type { PostDTO } from "@/lib/types";

interface PostListProps {
  posts: PostDTO[];
}

function displayGoal(goal: PostDTO["goals"][number]): string {
  if (goal.amount !== null) {
    return `${goal.name}: ${goal.amount}`;
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
                  aria-label="Attached goals"
                >
                  {post.goals.map((goal, index) => (
                    <li
                      className={
                        goal.met
                          ? "rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800"
                          : "bg-surface-accent text-primary rounded-full px-2.5 py-1 text-xs font-semibold"
                      }
                      key={goal.goalId ?? `${post.id}-goal-${index}`}
                    >
                      {goal.met ? "✓ " : ""}
                      {displayGoal(goal)}
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
