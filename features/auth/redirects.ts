const INTERNAL_ORIGIN = "https://75-soft.invalid";

const ALLOWED_REDIRECT_PREFIXES = [
  "/today",
  "/yesterday",
  "/feed",
  "/board",
  "/me",
  "/person/",
  "/admin",
  "/invite",
  "/signup",
  "/login",
  "/forgot-password",
  "/complete-profile",
  "/reset-password",
] as const;

function hasUnsafePathCharacters(value: string): boolean {
  return (
    value.includes("\\") ||
    value.includes("\u0000") ||
    /[\u0000-\u001f\u007f]/u.test(value)
  );
}

export function isAllowedInternalPath(value: string): boolean {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    hasUnsafePathCharacters(value)
  ) {
    return false;
  }

  try {
    const parsed = new URL(value, INTERNAL_ORIGIN);
    const decodedPath = decodeURIComponent(parsed.pathname);

    if (
      parsed.origin !== INTERNAL_ORIGIN ||
      decodedPath.startsWith("//") ||
      hasUnsafePathCharacters(decodedPath)
    ) {
      return false;
    }

    return ALLOWED_REDIRECT_PREFIXES.some((prefix) => {
      const normalizedPrefix = prefix.replace(/\/$/, "");
      return (
        decodedPath === normalizedPrefix ||
        decodedPath.startsWith(`${normalizedPrefix}/`)
      );
    });
  } catch {
    return false;
  }
}

export function safeInternalRedirect(
  value: string | null | undefined,
  fallback = "/today",
): string {
  if (!value || !isAllowedInternalPath(value)) {
    return fallback;
  }

  const parsed = new URL(value, INTERNAL_ORIGIN);
  return `${parsed.pathname}${parsed.search}`;
}
