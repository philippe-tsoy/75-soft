import { AuthCard } from "@/components/auth/auth-card";
import { InviteForm } from "@/features/auth/forms";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function InvitePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      description="Enter the invite code from your private group to get started."
      title="Join 75 Soft"
    >
      <InviteForm
        initialCode={firstValue(params.code)}
        initialError={firstValue(params.error)}
      />
    </AuthCard>
  );
}
