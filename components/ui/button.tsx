import { forwardRef, type ButtonHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary:
    "bg-primary text-primary-foreground shadow-sm hover:bg-[#24583f] focus-visible:ring-primary",
  secondary:
    "border border-border bg-card text-foreground hover:bg-surface-accent focus-visible:ring-primary",
  ghost: "text-foreground hover:bg-surface-accent focus-visible:ring-primary",
  danger:
    "bg-red-700 text-white shadow-sm hover:bg-red-800 focus-visible:ring-red-700",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { className, variant = "primary", type = "button", ...props },
    ref,
  ) {
    return (
      <button
        className={cn(
          "inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
          variants[variant],
          className,
        )}
        ref={ref}
        type={type}
        {...props}
      />
    );
  },
);
