import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const mockGetTask = vi.fn();
const mockGetTaskEvents = vi.fn();
vi.mock("@/lib/api-client", () => ({
  api: {
    getTask: (...args: any[]) => mockGetTask(...args),
    getTaskEvents: (...args: any[]) => mockGetTaskEvents(...args),
  },
}));

import { useTask } from "./use-task";

describe("useTask", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetTask.mockResolvedValue({
      task: { id: "t-1", title: "Test", state: "running" },
      pendingReason: null,
      pipelineProgress: null,
    });
    mockGetTaskEvents.mockResolvedValue({
      events: [
        { id: "e-1", toState: "running", trigger: "start", createdAt: "2025-06-01T00:00:00Z" },
      ],
    });
  });

  it("fetches task and events on mount", async () => {
    const { result } = renderHook(() => useTask("t-1"));

    await waitFor(() => {
      expect(result.current.task).not.toBeNull();
    });

    expect(mockGetTask).toHaveBeenCalledWith("t-1");
    expect(mockGetTaskEvents).toHaveBeenCalledWith("t-1");
    expect(result.current.task).toEqual({ id: "t-1", title: "Test", state: "running" });
    expect(result.current.events).toHaveLength(1);
  });

  it("sets loading=false after fetch completes", async () => {
    const { result } = renderHook(() => useTask("t-1"));

    expect(result.current.loading).toBe(true);

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it("sets error on fetch failure", async () => {
    mockGetTask.mockRejectedValue(new Error("Network error"));

    const { result } = renderHook(() => useTask("t-1"));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("Network error");
    expect(result.current.task).toBeNull();
  });

  it("returns pendingReason from task response", async () => {
    mockGetTask.mockResolvedValue({
      task: { id: "t-1", title: "Test", state: "queued" },
      pendingReason: "Waiting for available slot",
      pipelineProgress: null,
    });

    const { result } = renderHook(() => useTask("t-1"));

    await waitFor(() => {
      expect(result.current.pendingReason).toBe("Waiting for available slot");
    });
  });

  it("refreshes data on refresh() call", async () => {
    const { result } = renderHook(() => useTask("t-1"));

    await waitFor(() => {
      expect(result.current.task).not.toBeNull();
    });

    expect(mockGetTask).toHaveBeenCalledTimes(1);

    mockGetTask.mockResolvedValue({
      task: { id: "t-1", title: "Updated", state: "completed" },
      pendingReason: null,
      pipelineProgress: null,
    });
    mockGetTaskEvents.mockResolvedValue({ events: [] });

    await result.current.refresh();

    await waitFor(() => {
      expect(mockGetTask).toHaveBeenCalledTimes(2);
      expect(result.current.task.title).toBe("Updated");
    });
  });
});
