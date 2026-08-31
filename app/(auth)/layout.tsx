import type { ReactNode } from "react";
import { redirect } from "next/navigation";

import { getAccessContext } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function AuthLayout({
  children,
}: {
  children: ReactNode;
}) {
  if (await getAccessContext()) {
    redirect("/today");
  }

  return children;
}
