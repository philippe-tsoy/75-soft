"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Sheet } from "@/components/sheets/sheet";
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@/components/ui";
import { EmptyState, ErrorState, LoadingState, Toast } from "@/components/feedback";
import type { GoalTemplateAdminDTO } from "@/lib/types";

const ADMIN_GOAL_TEMPLATES_QUERY_KEY = ["admin", "goal-templates"] as const;

interface ApiErrorBody {
  error?: { message?: string };
}

class GoalTemplateApiError extends Error {}

async function request<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => null)) as
    | { data?: T }
    | ApiErrorBody
    | null;

  if (!response.ok) {
    const message =
      body && "error" in body
        ? (body.error?.message ?? "Could not save this template")
        : "Could not save this template";
    throw new GoalTemplateApiError(message);
  }

  return (body as { data: T }).data;
}

function fetchAdminGoalTemplates(): Promise<GoalTemplateAdminDTO[]> {
  return request<GoalTemplateAdminDTO[]>("/api/admin/goal-templates");
}

interface TemplateInput {
  name: string;
  targetValue: number | null;
  unit: string | null;
}

function createTemplate(input: TemplateInput): Promise<GoalTemplateAdminDTO> {
  return request<GoalTemplateAdminDTO>("/api/admin/goal-templates", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function patchTemplate(
  id: string,
  patch: Partial<TemplateInput> & { active?: boolean },
): Promise<GoalTemplateAdminDTO> {
  return request<GoalTemplateAdminDTO>(`/api/admin/goal-templates/${id}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Could not load the goal catalog. Try again.";
}

type FormMode = "checkbox" | "numeric";

function TemplateForm({
  open,
  template,
  onClose,
  onSaved,
}: {
  open: boolean;
  template: GoalTemplateAdminDTO | null;
  onClose: () => void;
  onSaved: (template: GoalTemplateAdminDTO) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [mode, setMode] = useState<FormMode>(
    template?.targetValue === null || template?.targetValue === undefined
      ? "checkbox"
      : "numeric",
  );
  const [targetValue, setTargetValue] = useState(
    template?.targetValue === null || template?.targetValue === undefined
      ? ""
      : String(template.targetValue),
  );
  const [unit, setUnit] = useState(template?.unit ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Name is required");
      return;
    }

    const numericTarget = mode === "numeric" ? Number(targetValue) : null;
    if (mode === "numeric") {
      if (!Number.isFinite(numericTarget) || (numericTarget ?? 0) <= 0) {
        setError("Target must be a positive number");
        return;
      }
      if (!unit.trim()) {
        setError("A unit is required for a numeric target");
        return;
      }
    }

    const input: TemplateInput = {
      name: trimmedName,
      targetValue: mode === "numeric" ? numericTarget : null,
      unit: mode === "numeric" ? unit.trim() : null,
    };

    setPending(true);
    try {
      const saved = template
        ? await patchTemplate(template.id, input)
        : await createTemplate(input);
      onSaved(saved);
      onClose();
    } catch (submitError) {
      setError(errorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <Sheet
      className="sm:max-w-lg"
      onClose={onClose}
      open={open}
      title={template ? "Edit suggestion" : "Add a suggestion"}
    >
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="space-y-2">
          <Label htmlFor="template-name">Name</Label>
          <Input
            id="template-name"
            maxLength={80}
            onChange={(event) => setName(event.target.value)}
            placeholder="Workout"
            value={name}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-foreground text-sm font-medium">
            Goal shape
          </legend>
          <label className="border-border bg-card flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm">
            <input
              checked={mode === "checkbox"}
              name="template-mode"
              onChange={() => setMode("checkbox")}
              type="radio"
            />
            <span className="font-medium">Checkbox</span>
          </label>
          <label className="border-border bg-card flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm">
            <input
              checked={mode === "numeric"}
              name="template-mode"
              onChange={() => setMode("numeric")}
              type="radio"
            />
            <span className="font-medium">Numeric target</span>
          </label>
        </fieldset>

        {mode === "numeric" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="template-target">Suggested target</Label>
              <Input
                id="template-target"
                inputMode="decimal"
                min="0"
                onChange={(event) => setTargetValue(event.target.value)}
                placeholder="10"
                step="any"
                type="number"
                value={targetValue}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-unit">Unit</Label>
              <Input
                id="template-unit"
                maxLength={40}
                onChange={(event) => setUnit(event.target.value)}
                placeholder="minutes"
                value={unit}
              />
            </div>
          </div>
        ) : null}

        {error ? (
          <p aria-live="assertive" className="text-sm text-red-700" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end gap-3">
          <Button onClick={onClose} variant="secondary">
            Cancel
          </Button>
          <Button disabled={pending} type="submit">
            {pending ? "Saving…" : "Save suggestion"}
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

export function GoalTemplatesPanel() {
  const queryClient = useQueryClient();
  const templatesQuery = useQuery({
    queryKey: ADMIN_GOAL_TEMPLATES_QUERY_KEY,
    queryFn: fetchAdminGoalTemplates,
  });
  const [formOpen, setFormOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<GoalTemplateAdminDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const updateCache = (saved: GoalTemplateAdminDTO) => {
    queryClient.setQueryData<GoalTemplateAdminDTO[]>(
      ADMIN_GOAL_TEMPLATES_QUERY_KEY,
      (current) => {
        if (!current) {
          return [saved];
        }
        const exists = current.some((entry) => entry.id === saved.id);
        return exists
          ? current.map((entry) => (entry.id === saved.id ? saved : entry))
          : [saved, ...current];
      },
    );
  };

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      patchTemplate(id, { active }),
    onSuccess: (saved) => {
      setActionError(null);
      updateCache(saved);
    },
    onError: (error: unknown) => setActionError(errorMessage(error)),
  });

  function openAddForm() {
    setEditingTemplate(null);
    setFormOpen(true);
  }

  function openEditForm(template: GoalTemplateAdminDTO) {
    setEditingTemplate(template);
    setFormOpen(true);
  }

  return (
    <>
      <Card aria-busy={toggleActiveMutation.isPending}>
        <CardHeader className="flex items-start justify-between gap-4 sm:flex-row">
          <div>
            <CardTitle>Goal catalog</CardTitle>
            <p className="text-muted mt-1 text-sm">
              Suggestions members see when picking goals. Retiring a
              suggestion does not touch any member&rsquo;s existing goal.
            </p>
          </div>
          <Button onClick={openAddForm} variant="secondary">
            Add suggestion
          </Button>
        </CardHeader>

        {templatesQuery.isPending ? (
          <LoadingState label="Loading the goal catalog…" />
        ) : templatesQuery.isError ? (
          <ErrorState
            message={errorMessage(templatesQuery.error)}
            onRetry={() => void templatesQuery.refetch()}
          />
        ) : (templatesQuery.data ?? []).length === 0 ? (
          <EmptyState message="No suggestions yet." />
        ) : (
          <ul className="space-y-3">
            {(templatesQuery.data ?? []).map((template) => (
              <li
                className="border-border rounded-2xl border p-4"
                key={template.id}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{template.name}</h3>
                    <p className="text-muted mt-1 text-sm">
                      {template.targetValue === null
                        ? "Checkbox goal"
                        : `Target: ${template.targetValue} ${template.unit}`}
                    </p>
                  </div>
                  <span
                    className={
                      template.active
                        ? "text-primary text-xs font-semibold"
                        : "text-muted text-xs font-semibold"
                    }
                  >
                    {template.active ? "Active" : "Retired"}
                  </span>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <Button onClick={() => openEditForm(template)} variant="ghost">
                    Edit
                  </Button>
                  <Button
                    disabled={toggleActiveMutation.isPending}
                    onClick={() =>
                      toggleActiveMutation.mutate({
                        id: template.id,
                        active: !template.active,
                      })
                    }
                    variant={template.active ? "danger" : "secondary"}
                  >
                    {template.active ? "Retire" : "Reactivate"}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <TemplateForm
        key={`${formOpen ? "open" : "closed"}:${editingTemplate?.id ?? "new"}`}
        onClose={() => setFormOpen(false)}
        onSaved={updateCache}
        open={formOpen}
        template={editingTemplate}
      />

      {actionError ? (
        <Toast
          message={actionError}
          onDismiss={() => setActionError(null)}
          tone="error"
        />
      ) : null}
    </>
  );
}
