import { notFound } from "next/navigation";

import { requireActiveMember } from "@/lib/auth/access";
import { HttpError } from "@/lib/http";
import { TeamScreen } from "@/components/teams/team-screen";
import { getMyTeam, getTeamSummary } from "@/features/teams/database";

export default async function TeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const access = await requireActiveMember();

  let summary;
  try {
    summary = await getTeamSummary(access.user.id, teamId);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) {
      notFound();
    }
    throw error;
  }

  const myTeam = await getMyTeam(access.user.id);

  return (
    <TeamScreen
      initialSummary={summary}
      teamId={teamId}
      viewerId={access.user.id}
      viewerIsAdmin={access.membership.role === "admin"}
      viewerTeamId={myTeam?.teamId ?? null}
    />
  );
}
