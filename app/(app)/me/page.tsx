import { OptionalGoalsPanel } from "@/components/optional-goals";
import { AchievementPanel } from "@/components/achievements";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import { ProfileEditor } from "@/features/profiles/profile-editor";
import { getCurrentProfile } from "@/features/profiles/service";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const profile = await getCurrentProfile();

  return (
    <div className="space-y-6 py-8">
      <header>
        <p className="text-primary text-sm font-semibold tracking-wide">
          Your space
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Me</h1>
        <p className="text-muted mt-2 text-sm">
          Manage personal goals and review progress that never changes required
          scoring.
        </p>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <ProfileEditor initialProfile={profile} />
      </Card>
      <OptionalGoalsPanel showArchived />
      <AchievementPanel />
    </div>
  );
}
