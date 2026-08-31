"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { MemberAvatar } from "@/components/board/member-avatar";
import type { ProfileDTO } from "@/lib/types";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/board", label: "Board" },
  { href: "/today", label: "Today" },
  { href: "/feed", label: "Feed" },
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
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-5 pb-2 sm:px-6">
        <div>
          <p className="text-primary text-sm font-semibold tracking-wide">
            75 Soft
          </p>
          <div className="text-muted flex items-center gap-2 text-xs">
            {localDate ? <time dateTime={localDate}>{localDate}</time> : null}
            {dayNumber && dayNumber > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span>Day {dayNumber}</span>
              </>
            ) : null}
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
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 pb-28 sm:px-6">
        {children}
      </main>

      <nav
        aria-label="Primary navigation"
        className="border-border bg-card/95 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-3 gap-1 p-2">
          {tabs.map((tab) => {
            const active =
              pathname === tab.href || pathname.startsWith(`${tab.href}/`);

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "focus-visible:ring-primary flex min-h-11 items-center justify-center rounded-xl border-b-2 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:outline-none",
                  active
                    ? "border-primary bg-surface-accent text-primary"
                    : "text-muted hover:bg-surface-accent hover:text-foreground border-transparent",
                )}
                href={tab.href}
                key={tab.href}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
