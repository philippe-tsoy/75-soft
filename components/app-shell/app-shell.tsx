"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const tabs = [
  { href: "/today", label: "Today" },
  { href: "/feed", label: "Feed" },
  { href: "/board", label: "Board" },
] as const;

interface AppShellProps {
  children: ReactNode;
  dayNumber?: number;
}

export function AppShell({ children, dayNumber }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 pt-5 pb-2 sm:px-6">
        <div>
          <p className="text-primary text-sm font-semibold tracking-wide">
            75 Soft
          </p>
          {dayNumber ? (
            <p className="text-muted text-xs">Day {dayNumber}</p>
          ) : null}
        </div>
        <Link
          aria-label="Open Me"
          className="border-border bg-card text-primary focus-visible:ring-primary flex min-h-11 min-w-11 items-center justify-center rounded-full border text-sm font-semibold focus-visible:ring-2"
          href="/me"
        >
          Me
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
                  "focus-visible:ring-primary flex min-h-11 items-center justify-center rounded-xl text-sm font-semibold transition-colors focus-visible:ring-2",
                  active
                    ? "bg-surface-accent text-primary"
                    : "text-muted hover:bg-surface-accent hover:text-foreground",
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
