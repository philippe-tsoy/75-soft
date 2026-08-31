import Link from "next/link";
import type { ReactNode } from "react";

import { Card } from "@/components/ui";

interface AuthCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

export function AuthCard({ title, description, children }: AuthCardProps) {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <Link
          className="text-primary mb-6 block text-center text-sm font-semibold tracking-wide"
          href="/invite"
        >
          75 Soft
        </Link>
        <Card>
          <div className="mb-6 space-y-2">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-muted text-sm leading-6">{description}</p>
          </div>
          {children}
        </Card>
      </div>
    </main>
  );
}
