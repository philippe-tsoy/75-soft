import type { InputHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "border-border bg-card text-foreground placeholder:text-muted focus-visible:ring-primary min-h-11 w-full rounded-xl border px-3 py-2 text-sm outline-none focus-visible:ring-2",
        className,
      )}
      {...props}
    />
  );
}
