import { AuthCard } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/features/auth/forms";

export default function ResetPasswordPage() {
  return (
    <AuthCard
      description="Choose a new password for your account."
      title="Set a new password"
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
