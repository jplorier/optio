import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildRouteTestApp } from "../test-utils/build-route-test-app.js";

// ─── Mocks ───

const mockListTaskTemplates = vi.fn();
const mockGetTaskTemplate = vi.fn();
const mockCreateTaskTemplate = vi.fn();
const mockUpdateTaskTemplate = vi.fn();
const mockDeleteTaskTemplate = vi.fn();

vi.mock("../services/task-template-service.js", () => ({
  listTaskTemplates: (...args: unknown[]) => mockListTaskTemplates(...args),
  getTaskTemplate: (...args: unknown[]) => mockGetTaskTemplate(...args),
  createTaskTemplate: (...args: unknown[]) => mockCreateTaskTemplate(...args),
  updateTaskTemplate: (...args: unknown[]) => mockUpdateTaskTemplate(...args),
  deleteTaskTemplate: (...args: unknown[]) => mockDeleteTaskTemplate(...args),
}));

const mockCreateTask = vi.fn();
const mockTransitionTask = vi.fn();
vi.mock("../services/task-service.js", () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
  transitionTask: (...args: unknown[]) => mockTransitionTask(...args),
}));

const mockQueueAdd = vi.fn().mockResolvedValue(undefined);
vi.mock("../workers/task-worker.js", () => ({
  taskQueue: {
    add: (...args: unknown[]) => mockQueueAdd(...args),
  },
}));

import { taskTemplateRoutes } from "./task-templates.js";
import { mockTask } from "../test-utils/fixtures.js";

// ─── Helpers ───

async function buildTestApp(): Promise<FastifyInstance> {
  return buildRouteTestApp(taskTemplateRoutes);
}

const mockTemplateData = {
  id: "tmpl-1",
  name: "Bug fix template",
  prompt: "Fix the bug in {{file}}",
  repoUrl: "https://github.com/org/repo",
  agentType: "claude-code",
  priority: 100,
  metadata: null,
};

describe("GET /api/task-templates", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("lists templates", async () => {
    mockListTaskTemplates.mockResolvedValue([mockTemplateData]);

    const res = await app.inject({ method: "GET", url: "/api/task-templates" });

    expect(res.statusCode).toBe(200);
    expect(res.json().templates).toHaveLength(1);
  });
});

describe("GET /api/task-templates/:id", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("returns 404 for template from another workspace", async () => {
    mockGetTaskTemplate.mockResolvedValue({ ...mockTemplateData, workspaceId: "ws-other" });

    const res = await app.inject({ method: "GET", url: "/api/task-templates/tmpl-1" });

    expect(res.statusCode).toBe(404);
  });

  it("returns template from own workspace", async () => {
    mockGetTaskTemplate.mockResolvedValue({ ...mockTemplateData, workspaceId: "ws-1" });

    const res = await app.inject({ method: "GET", url: "/api/task-templates/tmpl-1" });

    expect(res.statusCode).toBe(200);
  });
});

describe("POST /api/task-templates", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("creates a template", async () => {
    mockCreateTaskTemplate.mockResolvedValue(mockTemplateData);

    const res = await app.inject({
      method: "POST",
      url: "/api/task-templates",
      payload: { name: "Bug fix template", prompt: "Fix the bug" },
    });

    expect(res.statusCode).toBe(201);
  });

  it("rejects missing prompt (400 from Zod body schema)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/task-templates",
      payload: { name: "No prompt" },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe("POST /api/tasks/from-template/:id", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("creates task from template", async () => {
    mockGetTaskTemplate.mockResolvedValue(mockTemplateData);
    mockCreateTask.mockResolvedValue({ ...mockTask });
    mockTransitionTask.mockResolvedValue(undefined);

    const res = await app.inject({
      method: "POST",
      url: "/api/tasks/from-template/tmpl-1",
      payload: { title: "Fix login bug" },
    });

    expect(res.statusCode).toBe(201);
    expect(mockCreateTask).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Fix login bug",
        prompt: mockTemplateData.prompt,
        repoUrl: mockTemplateData.repoUrl,
      }),
    );
  });

  it("returns 404 for nonexistent template", async () => {
    mockGetTaskTemplate.mockResolvedValue(null);

    const res = await app.inject({
      method: "POST",
      url: "/api/tasks/from-template/nonexistent",
      payload: { title: "Test" },
    });

    expect(res.statusCode).toBe(404);
  });

  it("requires repoUrl when template has none", async () => {
    mockGetTaskTemplate.mockResolvedValue({ ...mockTemplateData, repoUrl: null });

    const res = await app.inject({
      method: "POST",
      url: "/api/tasks/from-template/tmpl-1",
      payload: { title: "Test" },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("repoUrl is required");
  });
});

describe("DELETE /api/task-templates/:id", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildTestApp();
  });

  it("deletes a template", async () => {
    mockGetTaskTemplate.mockResolvedValue({ ...mockTemplateData, workspaceId: "ws-1" });
    mockDeleteTaskTemplate.mockResolvedValue(undefined);

    const res = await app.inject({ method: "DELETE", url: "/api/task-templates/tmpl-1" });

    expect(res.statusCode).toBe(204);
  });

  it("returns 404 when deleting template from another workspace", async () => {
    mockGetTaskTemplate.mockResolvedValue({ ...mockTemplateData, workspaceId: "ws-other" });

    const res = await app.inject({ method: "DELETE", url: "/api/task-templates/tmpl-1" });

    expect(res.statusCode).toBe(404);
  });

  it("returns 404 for nonexistent template", async () => {
    mockGetTaskTemplate.mockResolvedValue(null);

    const res = await app.inject({ method: "DELETE", url: "/api/task-templates/tmpl-1" });

    expect(res.statusCode).toBe(404);
  });
});
