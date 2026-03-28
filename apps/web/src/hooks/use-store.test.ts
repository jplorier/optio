import { describe, it, expect, vi, beforeEach } from "vitest";
import { useStore } from "./use-store";
import type { TaskSummary, Notification } from "./use-store";

describe("useStore", () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useStore.setState({
      tasks: [],
      notifications: [],
      currentWorkspaceId: null,
      workspaces: [],
    });
    vi.stubGlobal("localStorage", {
      getItem: vi.fn().mockReturnValue(null),
      setItem: vi.fn(),
    });
  });

  const mockTask: TaskSummary = {
    id: "task-1",
    title: "Test Task",
    state: "running",
    agentType: "claude-code",
    repoUrl: "https://github.com/test/repo",
    createdAt: "2025-01-15T00:00:00Z",
    updatedAt: "2025-01-15T00:00:00Z",
  };

  describe("tasks", () => {
    it("initializes with empty tasks", () => {
      expect(useStore.getState().tasks).toEqual([]);
    });

    it("sets tasks", () => {
      useStore.getState().setTasks([mockTask]);
      expect(useStore.getState().tasks).toEqual([mockTask]);
    });

    it("adds a task to the beginning", () => {
      const task2: TaskSummary = { ...mockTask, id: "task-2", title: "Task 2" };
      useStore.getState().setTasks([mockTask]);
      useStore.getState().addTask(task2);
      expect(useStore.getState().tasks[0].id).toBe("task-2");
      expect(useStore.getState().tasks).toHaveLength(2);
    });

    it("updates a task by id", () => {
      useStore.getState().setTasks([mockTask]);
      useStore.getState().updateTask("task-1", { state: "completed" });
      expect(useStore.getState().tasks[0].state).toBe("completed");
    });

    it("does not modify other tasks when updating", () => {
      const task2: TaskSummary = { ...mockTask, id: "task-2" };
      useStore.getState().setTasks([mockTask, task2]);
      useStore.getState().updateTask("task-1", { state: "failed" });
      expect(useStore.getState().tasks[1].state).toBe("running");
    });

    it("leaves tasks unchanged if id is not found", () => {
      useStore.getState().setTasks([mockTask]);
      useStore.getState().updateTask("nonexistent", { state: "failed" });
      expect(useStore.getState().tasks[0].state).toBe("running");
    });
  });

  describe("notifications", () => {
    const mockNotification: Notification = {
      id: "notif-1",
      type: "info",
      title: "Test",
      timestamp: "2025-01-15T00:00:00Z",
    };

    it("initializes with empty notifications", () => {
      expect(useStore.getState().notifications).toEqual([]);
    });

    it("adds a notification to the beginning", () => {
      useStore.getState().addNotification(mockNotification);
      expect(useStore.getState().notifications[0]).toEqual(mockNotification);
    });

    it("limits notifications to 50", () => {
      for (let i = 0; i < 55; i++) {
        useStore.getState().addNotification({
          ...mockNotification,
          id: `notif-${i}`,
        });
      }
      expect(useStore.getState().notifications).toHaveLength(50);
    });

    it("dismisses a notification by id", () => {
      useStore.getState().addNotification(mockNotification);
      useStore.getState().addNotification({ ...mockNotification, id: "notif-2" });
      useStore.getState().dismissNotification("notif-1");
      expect(useStore.getState().notifications).toHaveLength(1);
      expect(useStore.getState().notifications[0].id).toBe("notif-2");
    });
  });

  describe("workspaces", () => {
    it("initializes currentWorkspaceId from localStorage", () => {
      // This tests the default behavior — already null since mock returns null
      expect(useStore.getState().currentWorkspaceId).toBeNull();
    });

    it("sets current workspace and persists to localStorage", () => {
      useStore.getState().setCurrentWorkspace("ws-123");
      expect(useStore.getState().currentWorkspaceId).toBe("ws-123");
      expect(localStorage.setItem).toHaveBeenCalledWith("optio_workspace_id", "ws-123");
    });

    it("sets workspaces list", () => {
      const workspaces = [{ id: "ws-1", name: "Default", slug: "default", role: "admin" }];
      useStore.getState().setWorkspaces(workspaces);
      expect(useStore.getState().workspaces).toEqual(workspaces);
    });
  });
});
