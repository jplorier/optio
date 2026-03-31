import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual("@/lib/utils");
  return { ...actual, formatRelativeTime: vi.fn(() => "2 minutes ago") };
});

vi.mock("./state-badge", () => ({
  StateBadge: ({ state }: { state: string }) => <span data-testid={`badge-${state}`}>{state}</span>,
}));

import { EventTimeline } from "./event-timeline";

function makeEvent(
  overrides: Partial<{
    id: string;
    fromState: string;
    toState: string;
    trigger: string;
    message: string;
    createdAt: string;
  }> = {},
) {
  return {
    id: overrides.id ?? "evt-1",
    toState: overrides.toState ?? "running",
    trigger: overrides.trigger ?? "user_action",
    createdAt: overrides.createdAt ?? "2025-06-01T00:00:00Z",
    ...(overrides.fromState !== undefined ? { fromState: overrides.fromState } : {}),
    ...(overrides.message !== undefined ? { message: overrides.message } : {}),
  };
}

describe("EventTimeline", () => {
  afterEach(cleanup);

  it("renders 'No events yet' when events array is empty", () => {
    render(<EventTimeline events={[]} />);
    expect(screen.getByText("No events yet")).toBeInTheDocument();
  });

  it("renders event with fromState and toState badges", () => {
    const events = [makeEvent({ fromState: "pending", toState: "queued" })];
    render(<EventTimeline events={events} />);
    expect(screen.getByTestId("badge-pending")).toBeInTheDocument();
    expect(screen.getByTestId("badge-queued")).toBeInTheDocument();
  });

  it("renders event without fromState (only toState badge, no arrow)", () => {
    const events = [makeEvent({ toState: "completed" })];
    const { container } = render(<EventTimeline events={events} />);
    expect(screen.getByTestId("badge-completed")).toBeInTheDocument();
    // No arrow span should be rendered when fromState is absent
    const arrowSpan = container.querySelector(".text-xs.text-text-muted\\/40");
    expect(arrowSpan).toBeNull();
  });

  it("shows trigger text with underscores replaced by spaces", () => {
    const events = [makeEvent({ trigger: "user_manual_action" })];
    render(<EventTimeline events={events} />);
    expect(screen.getByText("user manual action")).toBeInTheDocument();
  });

  it("shows message after trigger when present", () => {
    const events = [makeEvent({ trigger: "system", message: "Task timed out" })];
    render(<EventTimeline events={events} />);
    expect(screen.getByText("system", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("Task timed out", { exact: false })).toBeInTheDocument();
  });

  it("shows relative time for each event", () => {
    const events = [makeEvent({ id: "evt-1" }), makeEvent({ id: "evt-2" })];
    const { container } = render(<EventTimeline events={events} />);
    const timeElements = container.querySelectorAll(".tabular-nums");
    expect(timeElements).toHaveLength(2);
    expect(timeElements[0].textContent).toBe("2 minutes ago");
  });

  it("applies pulse animation class for active states on last event", () => {
    for (const state of ["running", "provisioning", "queued"]) {
      const { container, unmount } = render(
        <EventTimeline events={[makeEvent({ toState: state })]} />,
      );
      expect(container.querySelector(".animate-ping")).not.toBeNull();
      expect(container.querySelector(".glow-dot")).not.toBeNull();
      unmount();
    }
  });

  it("does not apply pulse on non-active final state (completed)", () => {
    const { container } = render(<EventTimeline events={[makeEvent({ toState: "completed" })]} />);
    expect(container.querySelector(".animate-ping")).toBeNull();
    expect(container.querySelector(".glow-dot")).toBeNull();
  });
});
