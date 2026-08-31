import { AuthCard } from "@/components/auth/auth-card";
import { CompleteProfileForm } from "@/features/auth/forms";

export default function CompleteProfilePage() {
  return (
    <AuthCard
      description="Add the details your group will see before your first check-in."
      title="Complete your profile"
    >
      <CompleteProfileForm />
    </AuthCard>
  );
}
