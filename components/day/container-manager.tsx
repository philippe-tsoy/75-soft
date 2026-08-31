"use client";

import {
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from "react";

import { Button, Card, Input, Label } from "@/components/ui";
import { DayApiError, requestDayApi } from "@/features/day-tracking/client";
import type { ContainerDTO } from "@/lib/types";

interface ContainerManagerProps {
  containers: ContainerDTO[];
  onContainersChange: Dispatch<SetStateAction<ContainerDTO[]>>;
  onError?: (message: string) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof DayApiError
    ? error.message
    : "Container change could not be saved";
}

function ContainerRow({
  container,
  onChange,
  onError,
}: {
  container: ContainerDTO;
  onChange: Dispatch<SetStateAction<ContainerDTO[]>>;
  onError: (message: string) => void;
}) {
  const [label, setLabel] = useState(container.label);
  const [volumeMl, setVolumeMl] = useState(String(container.volumeMl));
  const [pending, setPending] = useState(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextVolume = Number(volumeMl);
    if (!label.trim() || !Number.isInteger(nextVolume) || nextVolume <= 0) {
      onError("Use a label and a positive whole-number volume");
      return;
    }

    const previous = container;
    const optimistic = {
      ...container,
      label: label.trim(),
      volumeMl: nextVolume,
    };
    onChange((current) =>
      current.map((item) => (item.id === container.id ? optimistic : item)),
    );
    setPending(true);

    try {
      const updated = await requestDayApi<ContainerDTO>(
        `/api/containers/${container.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: optimistic.label,
            volumeMl: optimistic.volumeMl,
          }),
        },
      );
      onChange((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setLabel(updated.label);
      setVolumeMl(String(updated.volumeMl));
    } catch (error) {
      onChange((current) =>
        current.map((item) => (item.id === previous.id ? previous : item)),
      );
      onError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    const previous = container;
    onChange((current) => current.filter((item) => item.id !== container.id));
    setPending(true);

    try {
      await fetch(`/api/containers/${container.id}`, { method: "DELETE" }).then(
        async (response) => {
          if (!response.ok) {
            let message = "Container could not be deleted";
            try {
              const payload = (await response.json()) as {
                error?: { message?: string };
              };
              message = payload.error?.message ?? message;
            } catch {
              // Keep the stable fallback message for an empty error response.
            }
            throw new DayApiError(message, response.status, "INTERNAL_ERROR");
          }
        },
      );
    } catch (error) {
      onChange((current) =>
        [...current, previous].sort((a, b) => a.sortOrder - b.sortOrder),
      );
      onError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="border-border grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_8rem_auto_auto]"
      onSubmit={save}
    >
      <Label className="sr-only" htmlFor={`container-label-${container.id}`}>
        Container label
      </Label>
      <Input
        aria-label={`${container.label} label`}
        disabled={pending}
        id={`container-label-${container.id}`}
        onChange={(event) => setLabel(event.target.value)}
        value={label}
      />
      <Label className="sr-only" htmlFor={`container-volume-${container.id}`}>
        Volume in milliliters
      </Label>
      <Input
        aria-label={`${container.label} volume in milliliters`}
        disabled={pending}
        id={`container-volume-${container.id}`}
        min={1}
        onChange={(event) => setVolumeMl(event.target.value)}
        type="number"
        value={volumeMl}
      />
      <Button disabled={pending} type="submit" variant="secondary">
        Save
      </Button>
      <Button disabled={pending} onClick={() => void remove()} variant="danger">
        Delete
      </Button>
    </form>
  );
}

export function ContainerManager({
  containers,
  onContainersChange,
  onError,
}: ContainerManagerProps) {
  const [label, setLabel] = useState("");
  const [volumeMl, setVolumeMl] = useState("500");
  const [pending, setPending] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  function reportError(message: string) {
    setLocalError(message);
    onError?.(message);
  }

  async function addContainer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextVolume = Number(volumeMl);
    if (!label.trim() || !Number.isInteger(nextVolume) || nextVolume <= 0) {
      reportError("Use a label and a positive whole-number volume");
      return;
    }

    const optimisticId = `pending-${crypto.randomUUID()}`;
    const optimistic: ContainerDTO = {
      id: optimisticId,
      label: label.trim(),
      volumeMl: nextVolume,
      sortOrder: containers.length,
    };
    onContainersChange([...containers, optimistic]);
    setPending(true);
    setLocalError(null);

    try {
      const created = await requestDayApi<ContainerDTO>("/api/containers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: optimistic.label,
          volumeMl: optimistic.volumeMl,
        }),
      });
      onContainersChange((current) =>
        current.map((item) => (item.id === optimisticId ? created : item)),
      );
      setLabel("");
    } catch (error) {
      onContainersChange((current) =>
        current.filter((item) => item.id !== optimisticId),
      );
      reportError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Card aria-labelledby="container-manager-title">
      <div className="mb-4">
        <h2 className="text-base font-semibold" id="container-manager-title">
          Water containers
        </h2>
        <p className="text-muted mt-1 text-sm">
          Editing a container only affects future taps. Saved amounts stay
          immutable.
        </p>
      </div>

      <div className="space-y-2">
        {containers.map((container) => (
          <ContainerRow
            container={container}
            key={container.id}
            onChange={onContainersChange}
            onError={reportError}
          />
        ))}
        {containers.length === 0 ? (
          <p className="text-muted rounded-xl border border-dashed p-3 text-sm">
            No saved containers. The custom water control remains available.
          </p>
        ) : null}
      </div>

      <form
        className="mt-4 grid gap-2 sm:grid-cols-[1fr_8rem_auto]"
        onSubmit={addContainer}
      >
        <Label className="sr-only" htmlFor="new-container-label">
          New container label
        </Label>
        <Input
          disabled={pending}
          id="new-container-label"
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Travel mug"
          value={label}
        />
        <Label className="sr-only" htmlFor="new-container-volume">
          New container volume in milliliters
        </Label>
        <Input
          disabled={pending}
          id="new-container-volume"
          min={1}
          onChange={(event) => setVolumeMl(event.target.value)}
          type="number"
          value={volumeMl}
        />
        <Button disabled={pending} type="submit">
          Add container
        </Button>
      </form>

      {localError ? (
        <p
          aria-live="polite"
          className="mt-3 text-sm text-red-700"
          role="alert"
        >
          {localError}
        </p>
      ) : null}
    </Card>
  );
}
