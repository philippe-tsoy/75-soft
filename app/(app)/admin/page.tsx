import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getAdminDashboard } from "@/features/admin/service";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const dashboard = await getAdminDashboard();

  return <AdminDashboard initialData={dashboard} />;
}
