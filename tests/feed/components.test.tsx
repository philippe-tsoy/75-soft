import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PostCard } from "@/components/feed/post-card";
import { PostComposer } from "@/components/feed/post-composer";
import type { PostDTO } from "@/lib/types";

const post: PostDTO = {
  id: "00000000-0000-0000-0000-000000000001",
  author: {
    id: "00000000-0000-0000-0000-000000000002",
    displayName: "Member A",
    avatarUrl: null,
  },
  localDate: "2026-09-01",
  createdAt: "2026-09-01T12:00:00.000Z",
  goals: [
    {
      kind: "required",
      key: "workout",
      amount: 45,
      unit: "minutes",
      met: true,
    },
  ],
  note: "Good work",
  photoUrl: null,
  reactions: [],
  comments: [],
  canDelete: false,
};

describe("W3 feed components", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("prefills required post amounts with challenge targets", () => {
    render(
      <PostComposer
        onClose={vi.fn()}
        onPosted={vi.fn()}
        open
        optionalGoals={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /workout/i }));
    fireEvent.click(screen.getByRole("button", { name: /water/i }));
    fireEvent.click(screen.getByRole("button", { name: /reading/i }));

    expect(screen.getByLabelText(/workout amount/i)).toHaveValue(45);
    expect(screen.getByLabelText(/water amount/i)).toHaveValue(2);
    expect(screen.getByLabelText("Water unit")).toHaveValue("l");
    expect(screen.getByLabelText(/reading amount/i)).toHaveValue(10);
  });

  it("accepts water amounts expressed as fractional liters", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), { status: 201 }),
      );
    const { container } = render(
      <PostComposer
        onClose={vi.fn()}
        onPosted={vi.fn()}
        open
        optionalGoals={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /water/i }));
    fireEvent.change(screen.getByLabelText(/water amount/i), {
      target: { value: "0.5" },
    });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    const goals = JSON.parse(
      String((init?.body as FormData).get("goals")),
    ) as Array<{
      kind: string;
      key: string;
      amount: number;
      unit: string;
    }>;

    expect(goals).toEqual([
      { kind: "required", key: "water", amount: 0.5, unit: "l" },
    ]);
  });

  it("submits a required-goal post with a retry-stable operation id", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), { status: 201 }),
      );
    const { container } = render(
      <PostComposer
        onClose={vi.fn()}
        onPosted={vi.fn()}
        open
        optionalGoals={[]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /workout/i }));
    fireEvent.change(screen.getByLabelText(/workout amount/i), {
      target: { value: "45" },
    });
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    const body = init?.body as FormData;
    const operationId = body.get("clientOperationId");
    const goals = JSON.parse(String(body.get("goals"))) as Array<{
      key: string;
      amount: number;
    }>;

    expect(operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(
      (init?.headers as Record<string, string>)["x-client-operation-id"],
    ).toBe(operationId);
    expect(goals).toEqual([
      expect.objectContaining({ key: "workout", amount: 45 }),
    ]);
  });

  it("accepts optional-only posts in the compose sheet", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: {} }), { status: 201 }),
      );
    const { container } = render(
      <PostComposer
        onClose={vi.fn()}
        onPosted={vi.fn()}
        open
        optionalGoals={[
          {
            id: "00000000-0000-0000-0000-000000000010",
            name: "Meditate",
            targetValue: null,
            unit: null,
            active: true,
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /meditate/i }));
    fireEvent.submit(container.querySelector("form")!);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    const goals = JSON.parse(
      String((init?.body as FormData).get("goals")),
    ) as Array<{ kind: string; optionalGoalId: string }>;
    expect(goals).toEqual([
      {
        kind: "optional",
        optionalGoalId: "00000000-0000-0000-0000-000000000010",
        completed: false,
      },
    ]);
  });

  it("rejects overlong grapheme comments before making a request", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    render(<PostCard onChanged={vi.fn()} onDeleted={vi.fn()} post={post} />);

    fireEvent.change(screen.getByLabelText("Add a comment"), {
      target: { value: "💪".repeat(257) },
    });
    fireEvent.submit(screen.getByLabelText("Add a comment").closest("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Comments must contain 1–256 characters.",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
