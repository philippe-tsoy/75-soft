"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { Button, Input, Label } from "@/components/ui";

interface ApiResponse<T> {
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

function StatusMessage({
  children,
  tone = "error",
}: {
  children: ReactNode;
  tone?: "error" | "success";
}) {
  return (
    <p
      aria-live={tone === "error" ? "assertive" : "polite"}
      className={
        tone === "success"
          ? "bg-surface-accent rounded-xl px-3 py-2 text-sm"
          : "rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"
      }
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

async function readResponse<T>(response: Response): Promise<ApiResponse<T>> {
  try {
    return (await response.json()) as ApiResponse<T>;
  } catch {
    return {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    };
  }
}

function getErrorMessage<T>(body: ApiResponse<T>): string | null {
  return body.error?.message ?? null;
}

export function InviteForm({
  initialCode = "",
  initialError,
}: {
  initialCode?: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    initialError === "membership_required"
      ? "Your account needs an active membership to continue."
      : initialError
        ? "We could not validate your invite. Please try again."
        : null,
  );
  const initialValidationStarted = useRef(false);

  async function validate(value: string) {
    const normalized = value.trim();
    if (!normalized) {
      setMessage("Enter an invite code.");
      return;
    }

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/invite/validate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: normalized }),
      });
      const body = await readResponse<{
        valid: boolean;
        intentExpiresAt?: string;
      }>(response);

      if (!response.ok || !body.data?.valid) {
        setMessage(
          "That invite code is not valid. Ask an admin for the current code.",
        );
        return;
      }

      router.replace("/signup");
    } catch {
      setMessage("Unable to validate the invite right now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!initialCode || initialValidationStarted.current) {
      return;
    }

    initialValidationStarted.current = true;
    window.history.replaceState(null, "", "/invite");
    const timer = window.setTimeout(() => {
      void validate(initialCode);
    }, 0);

    return () => window.clearTimeout(timer);
    // The invite code is intentionally validated once when the link opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCode]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void validate(code);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {message ? <StatusMessage>{message}</StatusMessage> : null}
      <div className="space-y-2">
        <Label htmlFor="invite-code">Invite code</Label>
        <Input
          autoComplete="one-time-code"
          id="invite-code"
          name="inviteCode"
          onChange={(event) => setCode(event.target.value)}
          placeholder="Enter your invite code"
          required
          value={code}
        />
      </div>
      <Button className="w-full" disabled={busy} type="submit">
        {busy ? "Checking…" : "Continue"}
      </Button>
      <p className="text-muted text-center text-sm">
        Already joined?{" "}
        <Link className="text-primary font-semibold" href="/login">
          Sign in
        </Link>
      </p>
    </form>
  );
}

function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

export function SignupForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState(browserTimezone);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setSuccess(false);

    const formData = new FormData();
    formData.set("email", email);
    formData.set("password", password);
    formData.set("displayName", displayName);
    formData.set("timezone", timezone);
    if (avatar) {
      formData.set("avatar", avatar);
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        body: formData,
      });
      const body = await readResponse<{
        state: "active" | "awaiting_email_confirmation";
      }>(response);

      if (!response.ok || !body.data) {
        setMessage(
          getErrorMessage(body) ??
            "Unable to create your account. Please check your details.",
        );
        return;
      }

      if (body.data.state === "awaiting_email_confirmation") {
        setSuccess(true);
        setMessage(
          "Check your email to confirm your account. Your invite will be completed after confirmation.",
        );
      } else {
        router.replace("/today");
      }
    } catch {
      setMessage("Unable to create your account right now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {message ? (
        <StatusMessage tone={success ? "success" : "error"}>
          {message}
        </StatusMessage>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          autoComplete="email"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          autoComplete="new-password"
          id="password"
          minLength={8}
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
        <p className="text-muted text-xs">Use at least 8 characters.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          maxLength={80}
          name="displayName"
          onChange={(event) => setDisplayName(event.target.value)}
          required
          value={displayName}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">IANA timezone</Label>
        <Input
          id="timezone"
          name="timezone"
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="America/New_York"
          required
          value={timezone}
        />
        <p className="text-muted text-xs">
          This controls your local day and midnight reset.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="avatar">Profile photo (optional)</Label>
        <Input
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          id="avatar"
          name="avatar"
          onChange={(event) => setAvatar(event.target.files?.[0] ?? null)}
          type="file"
        />
      </div>
      <Button className="w-full" disabled={busy} type="submit">
        {busy ? "Creating account…" : "Create account"}
      </Button>
      {success ? (
        <p className="text-muted text-center text-sm">
          Already confirmed?{" "}
          <Link className="text-primary font-semibold" href="/login">
            Sign in
          </Link>
        </p>
      ) : null}
      <p className="text-muted text-center text-sm">
        Have an invite?{" "}
        <Link className="text-primary font-semibold" href="/invite">
          Validate it first
        </Link>
      </p>
    </form>
  );
}

export function LoginForm({
  initialError,
  initialMessage,
  next = "/today",
}: {
  initialError?: string;
  initialMessage?: string;
  next?: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(
    initialError === "removed"
      ? "This account was removed from the group. Contact an admin for help."
      : initialError
        ? "We could not complete sign in. Please try again."
        : null,
  );
  const [success, setSuccess] = useState(
    !initialError && Boolean(initialMessage),
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, next }),
      });
      const body = await readResponse<{
        state: "active" | "no_membership";
        redirectTo: string;
      }>(response);

      if (!response.ok || !body.data) {
        setMessage(
          getErrorMessage(body) ??
            "Unable to sign in with those details. Please try again.",
        );
        return;
      }

      router.replace(body.data.redirectTo);
    } catch {
      setMessage("Unable to sign in right now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {message ? (
        <StatusMessage tone={success ? "success" : "error"}>
          {message}
        </StatusMessage>
      ) : initialMessage ? (
        <StatusMessage tone="success">{initialMessage}</StatusMessage>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          autoComplete="email"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          autoComplete="current-password"
          id="password"
          name="password"
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      <Button className="w-full" disabled={busy} type="submit">
        {busy ? "Signing in…" : "Sign in"}
      </Button>
      <div className="flex justify-between gap-4 text-sm">
        <Link className="text-primary font-semibold" href="/forgot-password">
          Forgot password?
        </Link>
        <Link className="text-primary font-semibold" href="/invite">
          Create account
        </Link>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<"error" | "success">("error");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setMessageTone("error");
    try {
      const response = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const body = await readResponse<{ message: string }>(response);
      if (!response.ok) {
        setMessage(
          getErrorMessage(body) ?? "Unable to send a reset link right now.",
        );
        return;
      }
      setMessageTone("success");
      setMessage(
        body.data?.message ??
          "If an account exists for that email, a reset link is on its way.",
      );
    } catch {
      setMessageTone("error");
      setMessage("Unable to send a reset link right now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {message ? (
        <StatusMessage tone={messageTone}>{message}</StatusMessage>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          autoComplete="email"
          id="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </div>
      <Button className="w-full" disabled={busy} type="submit">
        {busy ? "Sending…" : "Send reset link"}
      </Button>
      <p className="text-muted text-center text-sm">
        <Link className="text-primary font-semibold" href="/login">
          Return to sign in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const body = await readResponse<{ state: "updated" }>(response);
      if (!response.ok || !body.data) {
        setMessage(
          getErrorMessage(body) ?? "Unable to update your password right now.",
        );
        return;
      }
      router.replace("/login?message=password_updated");
    } catch {
      setMessage("Unable to update your password right now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {message ? <StatusMessage>{message}</StatusMessage> : null}
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          autoComplete="new-password"
          id="password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm password</Label>
        <Input
          autoComplete="new-password"
          id="confirm-password"
          minLength={8}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </div>
      <Button className="w-full" disabled={busy} type="submit">
        {busy ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, confirmPassword }),
      });
      const body = await readResponse<{ state: "updated" }>(response);
      if (!response.ok || !body.data) {
        setMessage(
          getErrorMessage(body) ?? "Unable to update your password right now.",
        );
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setSuccess(true);
      setMessage("Password updated.");
    } catch {
      setMessage("Unable to update your password right now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {message ? (
        <StatusMessage tone={success ? "success" : "error"}>
          {message}
        </StatusMessage>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="change-password">New password</Label>
        <Input
          autoComplete="new-password"
          id="change-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="change-confirm-password">Confirm password</Label>
        <Input
          autoComplete="new-password"
          id="change-confirm-password"
          minLength={8}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </div>
      <Button disabled={busy} type="submit" variant="secondary">
        {busy ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

export function CompleteProfileForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState(browserTimezone);
  const [avatar, setAvatar] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    const formData = new FormData();
    formData.set("displayName", displayName);
    formData.set("timezone", timezone);
    if (avatar) {
      formData.set("avatar", avatar);
    }

    try {
      const response = await fetch("/api/auth/complete-profile", {
        method: "POST",
        body: formData,
      });
      const body = await readResponse<{ profile: unknown }>(response);
      if (!response.ok || !body.data) {
        setMessage(
          getErrorMessage(body) ?? "Unable to save your profile right now.",
        );
        return;
      }
      router.replace("/today");
    } catch {
      setMessage("Unable to save your profile right now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {message ? <StatusMessage>{message}</StatusMessage> : null}
      <div className="space-y-2">
        <Label htmlFor="display-name">Display name</Label>
        <Input
          id="display-name"
          maxLength={80}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          value={displayName}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="timezone">IANA timezone</Label>
        <Input
          id="timezone"
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="America/New_York"
          required
          value={timezone}
        />
        <p className="text-muted text-xs">
          This controls your local day and midnight reset.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="avatar">Profile photo (optional)</Label>
        <Input
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          id="avatar"
          onChange={(event) => setAvatar(event.target.files?.[0] ?? null)}
          type="file"
        />
      </div>
      <Button className="w-full" disabled={busy} type="submit">
        {busy ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}

export function LogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) {
        throw new Error("Unable to sign out right now.");
      }
      router.replace("/login");
    } catch (logoutError) {
      setError(
        logoutError instanceof Error
          ? logoutError.message
          : "Unable to sign out right now.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button disabled={busy} onClick={onClick} variant="secondary">
        {busy ? "Signing out…" : "Sign out"}
      </Button>
      {error ? (
        <p aria-live="assertive" className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
