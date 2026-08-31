import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/features/auth/forms";

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  return (
    <AuthCard
      description="Sign in to continue your daily check-in."
      title="Welcome back"
    >
      <LoginForm
        initialError={firstValue(params.error)}
        initialMessage={
          firstValue(params.message) === "password_updated"
            ? "Your password was updated. Sign in with the new password."
            : undefined
        }
      />
    </AuthCard>
  );
}
