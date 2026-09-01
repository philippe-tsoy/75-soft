import type { ComponentProps } from "react";
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
import { QueryProvider } from "@/components/providers/query-provider";
import type { DayRollupDTO, PostDTO } from "@/lib/types";

const TODAY = "2026-09-01";
const USER_ID = "00000000-0000-0000-0000-000000000099";

const incompleteDayPayload: DayRollupDTO = {
  localDate: TODAY,
  dayNumber: 1,
  status: "in_progress",
  editable: true,
  invalidated: false,
  goals: {
    workout: { amount: 15, target: 45, unit: "minutes", met: false },
    water: { amount: 2_000, target: 2_000, unit: "ml", met: true },
    reading: { amount: 10, target: 10, unit: "pages", met: true },
    diet: { target: 1, unit: "attestation", met: false },
  },
  metCount: 2,
};

const completeDayPayload: DayRollupDTO = {
  localDate: TODAY,
  dayNumber: 1,
  status: "complete",
  editable: true,
  invalidated: false,
  goals: {
    workout: { amount: 45, target: 45, unit: "minutes", met: true },
    water: { amount: 2_000, target: 2_000, unit: "ml", met: true },
    reading: { amount: 10, target: 10, unit: "pages", met: true },
    diet: { target: 1, unit: "attestation", met: true },
  },
  metCount: 4,
};

function mockFetchForDay(dayPayload: DayRollupDTO, postStatus = 201) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.includes("/api/day/")) {
      return new Response(JSON.stringify({ data: dayPayload }), {
        status: 200,
      });
    }

    if (url.includes("/api/posts")) {
      return new Response(JSON.stringify({ data: {} }), {
        status: postStatus,
      });
    }

    return new Response(JSON.stringify({ data: null }), { status: 200 });
  });
}

function renderComposer(
  props: Partial<ComponentProps<typeof PostComposer>> = {},
) {
  return render(
    <QueryProvider>
      <PostComposer
        onClose={vi.fn()}
        onPosted={vi.fn()}
        open
        optionalGoals={[]}
        today={TODAY}
        userId={USER_ID}
        {...props}
      />
    </QueryProvider>,
  );
}

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
  requiredSnapshot: {
    workout: { amount: 45, met: true },
    water: { amount: 2000, met: true },
    reading: { amount: 10, met: true },
    diet: { met: true },
  },
  teamId: null,
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

  it("gates posting until all required goals are met", async () => {
    mockFetchForDay(incompleteDayPayload);
    renderComposer();

    expect(
      await screen.findByText(/finish today.s goals to post/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Photo")).not.toBeInTheDocument();
    expect(screen.getAllByText("Not yet").length).toBeGreaterThan(0);
  });

  it("shows a read-only recap of the day's results once ready, with no amount inputs", async () => {
    mockFetchForDay(completeDayPayload);
    renderComposer();

    expect(await screen.findByText(/today.s results/i)).toBeInTheDocument();
    expect(screen.getByText(/45 minutes/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/workout amount/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^workout$/i })).not.toBeInTheDocument();
  });

  it("requires a photo before it will submit, once ready", async () => {
    const fetchMock = mockFetchForDay(completeDayPayload);
    renderComposer();
    await screen.findByText(/today.s results/i);

    fireEvent.submit(screen.getByRole("button", { name: /post update/i }).closest("form")!);

    expect(screen.getByRole("alert")).toHaveTextContent(/photo is required/i);
    expect(
      fetchMock.mock.calls.some(([input]) =>
        String(input).includes("/api/posts"),
      ),
    ).toBe(false);
  });

  it("submits an optional-goal post with a retry-stable operation id and no required-goal entries", async () => {
    const fetchMock = mockFetchForDay(completeDayPayload);
    renderComposer({
      optionalGoals: [
        {
          id: "00000000-0000-0000-0000-000000000010",
          name: "Meditate",
          targetValue: null,
          unit: null,
          active: true,
        },
      ],
    });
    await screen.findByText(/today.s results/i);

    fireEvent.click(screen.getByRole("button", { name: /meditate/i }));
    fireEvent.change(screen.getByLabelText("Photo"), {
      target: {
        files: [new File(["img"], "photo.png", { type: "image/png" })],
      },
    });
    fireEvent.submit(screen.getByRole("button", { name: /post update/i }).closest("form")!);

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([input]) =>
          String(input).includes("/api/posts"),
        ),
      ).toBe(true),
    );
    const [, init] = fetchMock.mock.calls.find(([input]) =>
      String(input).includes("/api/posts"),
    )!;
    const body = init?.body as FormData;
    const operationId = body.get("clientOperationId");
    const goals = JSON.parse(String(body.get("goals"))) as Array<{
      kind: string;
      optionalGoalId: string;
    }>;

    expect(operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(
      (init?.headers as Record<string, string>)["x-client-operation-id"],
    ).toBe(operationId);
    expect(goals).toEqual([
      {
        kind: "optional",
        optionalGoalId: "00000000-0000-0000-0000-000000000010",
        completed: false,
      },
    ]);
    expect(body.get("photo")).toBeInstanceOf(File);
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
