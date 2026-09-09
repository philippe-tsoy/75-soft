"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { MemberAvatar } from "@/components/board/member-avatar";
import { ChallengeMark } from "@/components/brand/challenge-mark";
import type { ProfileDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

interface TabIconProps {
  className?: string;
}

function TodayIcon({ className }: TabIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <rect height="18" rx="2" width="14" x="5" y="3" />
      <path d="M9 3v2h6V3" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

function StatsIcon({ className }: TabIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <path d="M5 20V10" />
      <path d="M12 20V4" />
      <path d="M19 20v-7" />
    </svg>
  );
}

function FeedIcon({ className }: TabIconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.8}
      viewBox="0 0 24 24"
    >
      <rect height="16" rx="2" width="16" x="4" y="4" />
      <path d="M8 9h8" />
      <path d="M8 13h8" />
      <path d="M8 17h5" />
    </svg>
  );
}

const tabs = [
  { href: "/today", label: "Today", Icon: TodayIcon },
  { href: "/stats", label: "Stats", Icon: StatsIcon },
  { href: "/feed", label: "Feed", Icon: FeedIcon },
] as const;

interface AppShellProps {
  children: ReactNode;
  dayNumber?: number;
  localDate?: string;
  profile?: Pick<ProfileDTO, "displayName" | "avatarUrl">;
}

export function AppShell({
  children,
  dayNumber,
  localDate,
  profile,
}: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh">
      <header className="border-border bg-card sticky top-0 z-30 border-b">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="bg-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
              <ChallengeMark fill="#ffffff" size={20} />
            </span>
            <div>
              <p className="text-foreground text-sm leading-tight font-semibold tracking-wide">
                75 Soft
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs">
                {localDate ? (
                  <time className="text-muted" dateTime={localDate}>
                    {localDate}
                  </time>
                ) : null}
                {dayNumber && dayNumber > 0 ? (
                  <span className="bg-surface-accent text-primary rounded-full px-2 py-0.5 font-semibold">
                    Day {dayNumber}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <Link
            aria-label="Open Me"
            className="border-border bg-card text-primary focus-visible:ring-primary flex min-h-11 min-w-11 items-center justify-center rounded-full border text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
            href="/me"
          >
            {profile ? (
              <MemberAvatar className="h-10 w-10" profile={profile} />
            ) : (
              "Me"
            )}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-28 sm:px-6">
        {children}
      </main>

      <nav
        aria-label="Primary navigation"
        className="border-border bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-1 p-2">
          {tabs.map(({ href, label, Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className="focus-visible:ring-primary flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none"
                href={href}
                key={href}
              >
                <span
                  className={cn(
                    "flex h-9 w-14 items-center justify-center rounded-full transition-colors",
                    active ? "bg-surface-accent text-primary" : "text-muted",
                  )}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <span className={active ? "text-primary" : "text-muted"}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
