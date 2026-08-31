import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";

import { getAccessContext } from "@/lib/auth/access";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await getAccessContext();

  if (!access) {
    redirect("/login");
  }

  if (access.membership.role !== "admin") {
    notFound();
  }

  return children;
}
