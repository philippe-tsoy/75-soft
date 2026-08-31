import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/app-shell";
import { COHORT_START_DATE } from "@/lib/config/75-soft";
import { getDayNumber, getMemberLocalDate } from "@/lib/dates";
import { getAccessContext, getSessionUser } from "@/lib/auth/access";
import { getCurrentProfile } from "@/features/profiles/service";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const access = await getAccessContext();
  if (!access) {
    redirect("/invite?error=membership_required");
  }

  const profile = await getCurrentProfile();
  const localDate = getMemberLocalDate(new Date(), profile.timezone ?? "UTC");
  const dayNumber = getDayNumber(localDate, COHORT_START_DATE);

  return (
    <AppShell
      dayNumber={dayNumber}
      localDate={localDate}
      profile={{
        avatarUrl: profile.avatarUrl,
        displayName: profile.displayName,
      }}
    >
      {children}
    </AppShell>
  );
}
