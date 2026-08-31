"use client";

/* eslint-disable @next/next/no-img-element -- signed private URLs are not configured as remote image domains. */
import { useEffect, useId, useRef } from "react";

import { cn } from "@/lib/utils";

interface LightboxProps {
  open: boolean;
  src: string | null;
  alt: string;
  onClose: () => void;
}

export function Lightbox({ open, src, alt, onClose }: LightboxProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab" || !dialogRef.current) {
        return;
      }

      const focusableElements = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      );
      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];

      if (!first || !last) {
        event.preventDefault();
        dialogRef.current.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus();
    };
  }, [onClose, open]);

  if (!open || !src) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close photo"
        className="absolute inset-0 bg-black/75"
        onClick={onClose}
        type="button"
      />
      <figure
        aria-labelledby={titleId}
        aria-modal="true"
        className={cn(
          "relative max-h-full max-w-full overflow-hidden rounded-2xl bg-black p-2 shadow-2xl",
        )}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <img
          alt={alt}
          className="max-h-[88dvh] max-w-[92vw] object-contain"
          src={src}
        />
        <figcaption className="sr-only" id={titleId}>
          {alt}
        </figcaption>
        <button
          aria-label="Close photo"
          className="absolute top-3 right-3 min-h-11 min-w-11 rounded-xl bg-black/60 text-2xl text-white focus-visible:ring-2 focus-visible:ring-white"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </figure>
    </div>
  );
}
