import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell/app-shell";
import { getAccessContext, getSessionUser } from "@/lib/auth/access";

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

  return <AppShell>{children}</AppShell>;
}
