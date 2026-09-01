import Link from "next/link";

import { OptionalGoalsPanel } from "@/components/optional-goals";
import { AchievementPanel } from "@/components/achievements";
import { ReactionPaletteEditor } from "@/components/profile/reaction-palette-editor";
import { Card, CardHeader, CardTitle } from "@/components/ui";
import { MyTeamPanel } from "@/components/teams/my-team-panel";
import { ChangePasswordForm, LogoutButton } from "@/features/auth/forms";
import { ProfileEditor } from "@/features/profiles/profile-editor";
import { getCurrentProfile } from "@/features/profiles/service";
import { APP_VERSION } from "@/lib/config/version";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const profile = await getCurrentProfile();

  return (
    <div className="space-y-6 py-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-primary text-sm font-semibold tracking-wide">
            Your space
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Me</h1>
          <p className="text-muted mt-2 text-sm">
            Manage personal goals and review progress that never changes
            required scoring.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {profile.role === "admin" ? (
            <Link
              className="border-border bg-card text-foreground focus-visible:ring-primary hover:bg-surface-accent inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
              href="/admin"
            >
              Admin
            </Link>
          ) : null}
          <LogoutButton />
        </div>
      </header>
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <ProfileEditor initialProfile={profile} />
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <p className="text-muted text-sm">
            View your shared profile or update your sign-in password.
          </p>
        </CardHeader>
        <div className="space-y-5">
          <Link
            className="border-border bg-card text-foreground hover:bg-surface-accent focus-visible:ring-primary inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
            href={`/person/${encodeURIComponent(profile.id)}`}
          >
            View your Person profile
          </Link>
          <div className="border-border border-t pt-5">
            <h3 className="font-semibold">Change password</h3>
            <p className="text-muted mt-1 mb-4 text-sm">
              Use at least 8 characters.
            </p>
            <ChangePasswordForm />
          </div>
        </div>
      </Card>
      <ReactionPaletteEditor />
      <MyTeamPanel userId={profile.id} />
      <OptionalGoalsPanel showArchived />
      <AchievementPanel />
      <p className="text-muted text-center text-xs">Version {APP_VERSION}</p>
    </div>
  );
}
