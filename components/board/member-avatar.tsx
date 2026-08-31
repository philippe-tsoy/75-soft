import type { ProfileDTO } from "@/lib/types";

interface MemberAvatarProps {
  profile: Pick<ProfileDTO, "displayName" | "avatarUrl">;
  className?: string;
}

function initials(displayName: string): string {
  return (
    displayName
      .trim()
      .split(/\s+/)
      .map((part) => part[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?"
  );
}

export function MemberAvatar({
  profile,
  className = "h-12 w-12",
}: MemberAvatarProps) {
  return (
    <span
      aria-label={`${profile.displayName} profile photo`}
      className={`bg-surface-accent text-primary relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full text-sm font-semibold ${className}`}
      role="img"
    >
      <span aria-hidden="true">{initials(profile.displayName)}</span>
      {profile.avatarUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          src={profile.avatarUrl}
        />
      ) : null}
    </span>
  );
}
