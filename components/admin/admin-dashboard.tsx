"use client";

import Link from "next/link";
import { useCallback, useMemo, useState, type FormEvent } from "react";

import { MemberAvatar } from "@/components/board/member-avatar";
import { Sheet } from "@/components/sheets/sheet";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/components/ui";
import type {
  AdminAuditEntryDTO,
  AdminDashboardDTO,
  AdminInviteDTO,
  AdminMemberDTO,
} from "@/features/admin/types";
import { getMemberLocalDate } from "@/lib/dates";

type Feedback = {
  tone: "success" | "error";
  message: string;
} | null;

type Confirmation =
  | { kind: "rotate" }
  | {
      kind: "invalidate";
      userId: string;
      displayName: string;
      localDate: string;
      reason: string;
    }
  | { kind: "remove"; userId: string; displayName: string };

interface AdminDashboardProps {
  initialData: AdminDashboardDTO;
}

async function requestAdminData<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body =
    response.status === 204 ? null : await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : "The administrator action could not be completed.";
    throw new Error(message);
  }

  return (body as { data: T }).data;
}

function formatAuditInstant(value: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function toAbsoluteInviteLink(inviteLink: string): string {
  if (typeof window === "undefined") {
    return inviteLink;
  }

  return new URL(inviteLink, window.location.origin).toString();
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    if (!document.execCommand("copy")) {
      throw new Error("Copy command was not available");
    }
  } finally {
    textarea.remove();
  }
}

function MemberRow({
  member,
  selected,
  onSelect,
}: {
  member: AdminMemberDTO;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <li>
      <button
        aria-pressed={selected}
        className={`flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors ${
          selected
            ? "border-primary bg-surface-accent"
            : "border-border hover:bg-surface-accent"
        }`}
        onClick={onSelect}
        type="button"
      >
        <MemberAvatar
          className="h-10 w-10"
          profile={{
            avatarUrl: member.avatarUrl,
            displayName: member.displayName,
          }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">
            {member.displayName}
          </span>
          <span className="text-muted block text-xs">
            Joined {member.joinLocalDate}
          </span>
        </span>
        <span className="text-muted text-xs capitalize">{member.role}</span>
      </button>
    </li>
  );
}

function ConfirmationContent({
  confirmation,
  onCancel,
  onConfirm,
  pending,
}: {
  confirmation: Confirmation;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
}) {
  let message = "This action changes group data.";
  let confirmLabel = "Confirm";

  if (confirmation.kind === "rotate") {
    message =
      "Rotate the invite code? The current code and all signup intents created from it will stop working immediately.";
    confirmLabel = "Rotate invite";
  } else if (confirmation.kind === "invalidate") {
    message = `Invalidate ${confirmation.displayName}'s day on ${confirmation.localDate}? All four required challenges will become not met, the Board score will be zero, and posts will remain visible.`;
    confirmLabel = "Invalidate day";
  } else if (confirmation.kind === "remove") {
    message = `Remove ${confirmation.displayName} from the active group? Their future access will be blocked and historical posts will not be deleted automatically.`;
    confirmLabel = "Remove member";
  }

  return (
    <div className="space-y-5">
      <p className="text-muted text-sm leading-6">{message}</p>
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <Button disabled={pending} onClick={onCancel} variant="secondary">
          Cancel
        </Button>
        <Button disabled={pending} onClick={onConfirm} variant="danger">
          {pending ? "Working…" : confirmLabel}
        </Button>
      </div>
    </div>
  );
}

export function AdminDashboard({ initialData }: AdminDashboardProps) {
  const [invite, setInvite] = useState<AdminInviteDTO | null>(
    initialData.invite,
  );
  const [members, setMembers] = useState<AdminMemberDTO[]>(initialData.members);
  const [audit, setAudit] = useState<AdminAuditEntryDTO[]>(initialData.audit);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(
    initialData.members[0]?.id ?? null,
  );
  const [localDate, setLocalDate] = useState(() =>
    getMemberLocalDate(
      new Date(),
      initialData.members[0]?.timezone ??
        Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
  );
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [pendingAction, setPendingAction] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const selectedMember = useMemo(
    () => members.find((member) => member.id === selectedMemberId) ?? null,
    [members, selectedMemberId],
  );

  const refreshData = useCallback(async () => {
    setRefreshing(true);
    try {
      const [nextInvite, nextMembers, nextAudit] = await Promise.all([
        requestAdminData<AdminInviteDTO | null>("/api/admin/invite"),
        requestAdminData<AdminMemberDTO[]>("/api/admin/members"),
        requestAdminData<AdminAuditEntryDTO[]>("/api/admin/audit"),
      ]);
      setInvite(nextInvite);
      setMembers(nextMembers);
      setAudit(nextAudit);
      const nextSelectedMember =
        nextMembers.find((member) => member.id === selectedMemberId) ??
        nextMembers[0] ??
        null;
      setSelectedMemberId(nextSelectedMember?.id ?? null);
      if (nextSelectedMember) {
        setLocalDate(
          getMemberLocalDate(new Date(), nextSelectedMember.timezone),
        );
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The administrator data could not be refreshed.",
      });
    } finally {
      setRefreshing(false);
    }
  }, [selectedMemberId]);

  const performConfirmation = useCallback(async () => {
    if (!confirmation) {
      return;
    }

    setPendingAction(true);
    setFeedback(null);

    try {
      if (confirmation.kind === "rotate") {
        await requestAdminData<AdminInviteDTO>("/api/admin/invite/rotate", {
          method: "POST",
        });
        setFeedback({
          tone: "success",
          message: "Invite rotated. The previous code is no longer valid.",
        });
      } else if (confirmation.kind === "invalidate") {
        await requestAdminData(
          "/api/admin/members/" + confirmation.userId + "/invalidate-day",
          {
            method: "POST",
            body: JSON.stringify({
              localDate: confirmation.localDate,
              reason: confirmation.reason || null,
            }),
          },
        );
        setFeedback({
          tone: "success",
          message:
            "Day invalidated. Required challenges are not met, the score is zero, and posts remain visible.",
        });
      } else if (confirmation.kind === "remove") {
        await requestAdminData(
          "/api/admin/members/" + confirmation.userId + "/remove",
          {
            method: "POST",
          },
        );
        setFeedback({
          tone: "success",
          message: `${confirmation.displayName} was removed from the active group.`,
        });
      }

      setConfirmation(null);
      await refreshData();
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "The administrator action could not be completed.",
      });
    } finally {
      setPendingAction(false);
    }
  }, [confirmation, refreshData]);

  const handleInvalidateSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedMember) {
      return;
    }

    setConfirmation({
      kind: "invalidate",
      userId: selectedMember.id,
      displayName: selectedMember.displayName,
      localDate,
      reason,
    });
  };

  const handleCopyInvite = async () => {
    if (!invite) {
      return;
    }

    try {
      await copyText(toAbsoluteInviteLink(invite.inviteLink));
      setFeedback({ tone: "success", message: "Invite link copied." });
    } catch {
      setFeedback({
        tone: "error",
        message: "The invite link could not be copied on this device.",
      });
    }
  };

  return (
    <>
      <div className="space-y-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide">
              Administration
            </p>
            <h1 className="mt-1 text-2xl font-semibold">Group controls</h1>
            <p className="text-muted mt-2 max-w-xl text-sm leading-6">
              Manage the reusable invite, active membership, and moderation
              actions. Every change is checked server-side and recorded.
            </p>
          </div>
          <Link
            className="text-primary hover:bg-surface-accent focus-visible:ring-primary min-h-11 rounded-xl px-3 py-2 text-sm font-semibold focus-visible:ring-2"
            href="/today"
          >
            Back
          </Link>
        </div>

        {feedback ? (
          <p
            aria-live={feedback.tone === "error" ? "assertive" : "polite"}
            className={
              feedback.tone === "error"
                ? "rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900"
                : "rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900"
            }
            role={feedback.tone === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>Group invite</CardTitle>
            <p className="text-muted text-sm">
              There is one reusable code. Rotating it invalidates the old code
              and its pending signup intents immediately.
            </p>
          </CardHeader>
          {invite ? (
            <div className="space-y-4">
              <div className="bg-surface-accent rounded-xl p-4">
                <p className="text-muted text-xs font-semibold tracking-wide uppercase">
                  Current code
                </p>
                <code className="text-foreground mt-2 block text-lg font-semibold break-all">
                  {invite.code}
                </code>
                <p className="text-muted mt-1 text-xs">
                  Hint: {invite.codeHint}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="invite-link">Invite link</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input id="invite-link" readOnly value={invite.inviteLink} />
                  <Button
                    onClick={() => void handleCopyInvite()}
                    variant="secondary"
                  >
                    Copy link
                  </Button>
                </div>
              </div>
              <Button
                disabled={pendingAction}
                onClick={() => setConfirmation({ kind: "rotate" })}
                variant="danger"
              >
                Rotate invite
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-muted text-sm">
                No active invite is configured. Generate one before accepting
                new members.
              </p>
              <Button
                disabled={pendingAction}
                onClick={() => setConfirmation({ kind: "rotate" })}
              >
                Generate invite
              </Button>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active members</CardTitle>
            <p className="text-muted text-sm">
              Select a member to invalidate one local date or remove their
              active membership. Admin actions never write amounts to another
              member&apos;s day.
            </p>
          </CardHeader>
          {members.length > 0 ? (
            <div className="space-y-5">
              <ul aria-label="Active members" className="space-y-2">
                {members.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    onSelect={() => {
                      setSelectedMemberId(member.id);
                      setLocalDate(
                        getMemberLocalDate(new Date(), member.timezone),
                      );
                    }}
                    selected={member.id === selectedMemberId}
                  />
                ))}
              </ul>

              {selectedMember ? (
                <div className="border-border space-y-5 rounded-xl border p-4">
                  <div>
                    <h3 className="font-semibold">
                      Moderate {selectedMember.displayName}
                    </h3>
                    <p className="text-muted mt-1 text-xs">
                      Member timezone: {selectedMember.timezone}
                    </p>
                  </div>
                  <form className="space-y-4" onSubmit={handleInvalidateSubmit}>
                    <div className="space-y-2">
                      <Label htmlFor="invalidation-date">Local date</Label>
                      <Input
                        id="invalidation-date"
                        onChange={(event) => setLocalDate(event.target.value)}
                        required
                        type="date"
                        value={localDate}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invalidation-reason">
                        Reason <span className="text-muted">(optional)</span>
                      </Label>
                      <textarea
                        className="border-border bg-card text-foreground placeholder:text-muted focus-visible:ring-primary min-h-24 w-full rounded-xl border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                        id="invalidation-reason"
                        maxLength={500}
                        onChange={(event) => setReason(event.target.value)}
                        placeholder="Add a moderation note"
                        value={reason}
                      />
                    </div>
                    <Button
                      disabled={pendingAction}
                      type="submit"
                      variant="danger"
                    >
                      Invalidate selected day
                    </Button>
                  </form>
                  {selectedMember.role === "member" ? (
                    <div className="border-border border-t pt-4">
                      <Button
                        disabled={pendingAction}
                        onClick={() =>
                          setConfirmation({
                            kind: "remove",
                            userId: selectedMember.id,
                            displayName: selectedMember.displayName,
                          })
                        }
                        variant="danger"
                      >
                        Remove member
                      </Button>
                    </div>
                  ) : (
                    <p className="text-muted border-border border-t pt-4 text-sm">
                      Admin memberships cannot be removed from this screen.
                    </p>
                  )}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-muted text-sm">No active members found.</p>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Moderation</CardTitle>
            <p className="text-muted text-sm">
              Open the Feed to review posts and use the delete controls directly
              on the post or comment. Deleting a post removes its logged amounts
              from scoring while keeping the moderation action audited.
            </p>
          </CardHeader>
          <div>
            <Link
              className="border-border bg-card text-foreground hover:bg-surface-accent focus-visible:ring-primary inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:outline-none"
              href="/feed"
            >
              Open Feed moderation
            </Link>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Recent activity</CardTitle>
                <p className="text-muted mt-1 text-sm">
                  Sensitive invite values and private payloads are not shown.
                </p>
              </div>
              <Button
                disabled={refreshing || pendingAction}
                onClick={() => void refreshData()}
                variant="secondary"
              >
                {refreshing ? "Refreshing…" : "Refresh"}
              </Button>
            </div>
          </CardHeader>
          {audit.length > 0 ? (
            <ul
              aria-label="Recent administrator activity"
              className="divide-border divide-y"
            >
              {audit.map((entry) => (
                <li
                  className="flex flex-col gap-1 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                  key={entry.id}
                >
                  <span className="font-medium">{entry.action}</span>
                  <span className="text-muted text-xs">
                    {entry.targetType}
                    {entry.targetId ? ` · ${entry.targetId}` : ""} ·{" "}
                    {formatAuditInstant(entry.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted text-sm">No administrator activity yet.</p>
          )}
        </Card>
      </div>

      {confirmation ? (
        <Sheet
          onClose={() => {
            if (!pendingAction) {
              setConfirmation(null);
            }
          }}
          open
          title="Confirm administrator action"
        >
          <ConfirmationContent
            confirmation={confirmation}
            onCancel={() => setConfirmation(null)}
            onConfirm={() => void performConfirmation()}
            pending={pendingAction}
          />
        </Sheet>
      ) : null}
    </>
  );
}
