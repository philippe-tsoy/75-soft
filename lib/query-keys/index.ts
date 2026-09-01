export const queryKeys = {
  session: () => ["session"] as const,
  profile: (userId = "me") => ["profile", userId] as const,
  day: (userId: string, localDate: string) =>
    ["day", userId, localDate] as const,
  today: (userId: string, localDate: string) =>
    ["today", userId, localDate] as const,
  groupStrip: (asOfLocalDate: string) =>
    ["group-strip", asOfLocalDate] as const,
  board: (asOfInstantBucket: string) => ["board", asOfInstantBucket] as const,
  feed: (cursor: string | null) => ["feed", cursor] as const,
  post: (postId: string) => ["post", postId] as const,
  person: (userId: string) => ["person", userId] as const,
  containers: (userId: string) => ["containers", userId] as const,
  optionalGoals: (userId: string) => ["optional-goals", userId] as const,
  achievements: (userId: string) => ["achievements", userId] as const,
  teams: () => ["teams"] as const,
  team: (teamId: string) => ["team", teamId] as const,
  myTeam: (userId: string) => ["my-team", userId] as const,
  adminMembers: () => ["admin", "members"] as const,
  adminInvite: () => ["admin", "invite"] as const,
};

export type QueryKey = ReturnType<(typeof queryKeys)[keyof typeof queryKeys]>;
