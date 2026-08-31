import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/features/auth/forms";

export default function SignupPage() {
  return (
    <AuthCard
      description="An invite is required before an account can join the group."
      title="Create your account"
    >
      <SignupForm />
    </AuthCard>
  );
}
