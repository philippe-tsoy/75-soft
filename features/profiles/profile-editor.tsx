"use client";

import { type FormEvent, useEffect, useState } from "react";

import { Button, Input, Label } from "@/components/ui";
import type { ProfileDTO } from "@/lib/types";

interface ProfileResponse {
  data?: ProfileDTO & { profile?: ProfileDTO; palette?: string[] };
  error?: { message: string };
}

function responseProfile(body: ProfileResponse): ProfileDTO | undefined {
  return body.data?.profile ?? body.data;
}

async function readResponse(response: Response): Promise<ProfileResponse> {
  try {
    return (await response.json()) as ProfileResponse;
  } catch {
    return { error: { message: "Something went wrong. Please try again." } };
  }
}

export function ProfileEditor({
  initialProfile,
}: {
  initialProfile?: ProfileDTO;
}) {
  const [profile, setProfile] = useState<ProfileDTO | undefined>(
    initialProfile,
  );
  const [displayName, setDisplayName] = useState(
    initialProfile?.displayName ?? "",
  );
  const [timezone, setTimezone] = useState(initialProfile?.timezone ?? "");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [busy, setBusy] = useState(!initialProfile);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (initialProfile) {
      return;
    }

    let cancelled = false;
    void fetch("/api/profile")
      .then(readResponse)
      .then((body) => {
        if (cancelled) {
          return;
        }
        const loadedProfile = responseProfile(body);
        if (loadedProfile) {
          setProfile(loadedProfile);
          setDisplayName(loadedProfile.displayName);
          setTimezone(loadedProfile.timezone ?? "");
        } else {
          setMessage(body.error?.message ?? "Unable to load your profile.");
        }
        setBusy(false);
      })
      .catch(() => {
        if (!cancelled) {
          setMessage("Unable to load your profile.");
          setBusy(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialProfile]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setSuccess(false);

    const request: RequestInit = avatar
      ? (() => {
          const formData = new FormData();
          formData.set("displayName", displayName);
          formData.set("timezone", timezone);
          formData.set("avatar", avatar);
          return { method: "PATCH", body: formData };
        })()
      : {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ displayName, timezone }),
        };

    try {
      const body = await fetch("/api/profile", request).then(readResponse);
      const updatedProfile = responseProfile(body);
      if (!updatedProfile) {
        setMessage(body.error?.message ?? "Unable to save your profile.");
        return;
      }

      setProfile(updatedProfile);
      setDisplayName(updatedProfile.displayName);
      setTimezone(updatedProfile.timezone ?? "");
      setAvatar(null);
      setSuccess(true);
      setMessage("Profile updated.");
    } catch {
      setMessage("Unable to save your profile. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      {message ? (
        <p
          aria-live="polite"
          className={
            success
              ? "bg-surface-accent rounded-xl px-3 py-2 text-sm"
              : "rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"
          }
          role={success ? "status" : "alert"}
        >
          {message}
        </p>
      ) : null}
      <div className="space-y-2">
        <Label htmlFor="profile-display-name">Display name</Label>
        <Input
          disabled={busy}
          id="profile-display-name"
          maxLength={80}
          onChange={(event) => setDisplayName(event.target.value)}
          required
          value={displayName}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-timezone">IANA timezone</Label>
        <Input
          disabled={busy}
          id="profile-timezone"
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="America/New_York"
          required
          value={timezone}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="profile-avatar">Profile photo (optional)</Label>
        <Input
          accept="image/jpeg,image/png,image/webp"
          capture="user"
          disabled={busy}
          id="profile-avatar"
          onChange={(event) => setAvatar(event.target.files?.[0] ?? null)}
          type="file"
        />
        {profile?.avatarUrl ? (
          <p className="text-muted text-xs">
            A profile photo is currently set.
          </p>
        ) : null}
      </div>
      <Button className="w-full" disabled={busy} type="submit">
        {busy ? "Saving…" : "Save profile"}
      </Button>
    </form>
  );
}
