import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

// Mock next/navigation
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

// Mock @optio/shared
vi.mock("@optio/shared", () => ({
  classifyError: (msg: string) => ({
    title: msg.length > 40 ? msg.slice(0, 40) + "..." : msg,
    description: msg,
    category: "agent",
    remedy: "Retry the task",
  }),
}));

// Mock api-client
vi.mock("@/lib/api-client", () => ({
  api: {
    retryTask: vi.fn(),
    runNowTask: vi.fn(),
  },
}));

import { TaskCard } from "./task-card";

const baseTask = {
  id: "task-1",
  title: "Fix authentication bug",
  state: "running",
  agentType: "claude-code",
  repoUrl: "https://github.com/acme/webapp",
  createdAt: "2025-01-15T12:00:00Z",
  updatedAt: "2025-01-15T12:30:00Z",
};

describe("TaskCard", () => {
  afterEach(() => {
    cleanup();
    pushMock.mockClear();
  });

  it("renders the task title", () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.getByText("Fix authentication bug")).toBeInTheDocument();
  });

  it("renders the repo name split into owner and repo", () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.getAllByText("acme/")).toHaveLength(1);
    expect(screen.getByText("webapp")).toBeInTheDocument();
  });

  it("renders the agent type", () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.getByText("claude code")).toBeInTheDocument();
  });

  it("renders the state badge", () => {
    render(<TaskCard task={baseTask} />);
    expect(screen.getByText("Running")).toBeInTheDocument();
  });

  it("renders cost when present", () => {
    render(<TaskCard task={{ ...baseTask, costUsd: "1.5" }} />);
    expect(screen.getByText("$1.50")).toBeInTheDocument();
  });

  it("does not render cost when absent", () => {
    const { container } = render(<TaskCard task={baseTask} />);
    expect(container.querySelector(".cost-pill")).toBeNull();
  });

  it("renders PR link when prUrl is present", () => {
    render(<TaskCard task={{ ...baseTask, prUrl: "https://github.com/acme/webapp/pull/42" }} />);
    expect(screen.getByText("PR #42")).toBeInTheDocument();
  });

  it("renders review badge for review tasks", () => {
    render(<TaskCard task={{ ...baseTask, taskType: "review" }} />);
    expect(screen.getByText("Automatic Review")).toBeInTheDocument();
  });

  it("shows error section for failed tasks", () => {
    render(
      <TaskCard task={{ ...baseTask, state: "failed", errorMessage: "Auth token expired" }} />,
    );
    expect(screen.getByText("Auth token expired")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("shows waiting indicator for waiting_on_deps state", () => {
    render(<TaskCard task={{ ...baseTask, state: "waiting_on_deps" }} />);
    expect(screen.getByText("Waiting for dependencies to complete")).toBeInTheDocument();
  });

  it("shows pending step indicator", () => {
    render(<TaskCard task={{ ...baseTask, state: "pending", taskType: "step" }} />);
    expect(screen.getByText("Waiting for previous step")).toBeInTheDocument();
  });

  it("shows off-peak indicator when pending reason is waiting_for_off_peak", () => {
    render(
      <TaskCard task={{ ...baseTask, state: "queued", pendingReason: "waiting_for_off_peak" }} />,
    );
    expect(screen.getByText("Waiting for off-peak hours")).toBeInTheDocument();
    expect(screen.getByText("Run Now")).toBeInTheDocument();
  });

  it("renders subtasks when provided", () => {
    const subtasks = [
      { ...baseTask, id: "sub-1", title: "Review code", taskType: "review", state: "completed" },
      { ...baseTask, id: "sub-2", title: "Fix tests", state: "running" },
    ];
    render(<TaskCard task={baseTask} subtasks={subtasks} />);
    expect(screen.getByText("Review code")).toBeInTheDocument();
    expect(screen.getByText("Fix tests")).toBeInTheDocument();
  });

  it("navigates to task detail on click", async () => {
    const { container } = render(<TaskCard task={baseTask} />);
    const card = container.firstElementChild as HTMLElement;
    card.click();
    expect(pushMock).toHaveBeenCalledWith("/tasks/task-1");
  });
});
