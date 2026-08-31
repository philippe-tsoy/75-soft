import { AuthCard } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/features/auth/forms";

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      description="We’ll send a reset link to the email on your account."
      title="Reset your password"
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
