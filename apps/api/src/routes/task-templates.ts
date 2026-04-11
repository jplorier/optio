import type { FastifyInstance } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";
import { z } from "zod";
import * as taskTemplateService from "../services/task-template-service.js";
import * as taskService from "../services/task-service.js";
import { TaskState } from "@optio/shared";
import { taskQueue } from "../workers/task-worker.js";
import { ErrorResponseSchema, IdParamsSchema } from "../schemas/common.js";
import { TaskTemplateSchema } from "../schemas/integration.js";
import { TaskSchema, AgentTypeSchema } from "../schemas/task.js";

const repoUrlQuerySchema = z
  .object({
    repoUrl: z.string().optional().describe("Optional repo URL scope filter"),
  })
  .describe("Query parameters for listing task templates");

const createTemplateSchema = z
  .object({
    name: z.string().min(1),
    repoUrl: z.string().optional(),
    prompt: z.string().min(1),
    agentType: AgentTypeSchema.optional(),
    priority: z.number().int().min(1).max(1000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .describe("Body for creating a task template");

const updateTemplateSchema = z
  .object({
    name: z.string().min(1).optional(),
    repoUrl: z.string().nullable().optional(),
    prompt: z.string().min(1).optional(),
    agentType: AgentTypeSchema.optional(),
    priority: z.number().int().min(1).max(1000).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .describe("Partial update to a task template");

const createFromTemplateSchema = z
  .object({
    title: z.string().min(1),
    repoUrl: z.string().url().optional(),
    repoBranch: z
      .string()
      .regex(/^[a-zA-Z0-9._/-]+$/, "Invalid branch name")
      .optional(),
    prompt: z.string().optional().describe("Override template prompt"),
    agentType: AgentTypeSchema.optional(),
    priority: z.number().int().min(1).max(1000).optional(),
    maxRetries: z.number().int().min(0).max(10).optional(),
    metadata: z.record(z.unknown()).optional(),
  })
  .describe("Body for instantiating a task from a template with overrides");

const TemplateListResponseSchema = z.object({ templates: z.array(TaskTemplateSchema) });
const TemplateResponseSchema = z.object({ template: TaskTemplateSchema });
const TaskResponseSchema = z.object({ task: TaskSchema });

export async function taskTemplateRoutes(rawApp: FastifyInstance) {
  const app = rawApp.withTypeProvider<ZodTypeProvider>();

  app.get(
    "/api/task-templates",
    {
      schema: {
        operationId: "listTaskTemplates",
        summary: "List task templates",
        description: "Return all task templates in the current workspace.",
        tags: ["Repos & Integrations"],
        querystring: repoUrlQuerySchema,
        response: { 200: TemplateListResponseSchema },
      },
    },
    async (req, reply) => {
      const workspaceId = req.user?.workspaceId ?? null;
      const templates = await taskTemplateService.listTaskTemplates(req.query.repoUrl, workspaceId);
      reply.send({ templates });
    },
  );

  app.get(
    "/api/task-templates/:id",
    {
      schema: {
        operationId: "getTaskTemplate",
        summary: "Get a task template",
        description: "Fetch a single task template by ID.",
        tags: ["Repos & Integrations"],
        params: IdParamsSchema,
        response: { 200: TemplateResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const template = await taskTemplateService.getTaskTemplate(id);
      if (!template) return reply.status(404).send({ error: "Template not found" });
      const wsId = req.user?.workspaceId;
      if (wsId && template.workspaceId && template.workspaceId !== wsId) {
        return reply.status(404).send({ error: "Template not found" });
      }
      reply.send({ template });
    },
  );

  app.post(
    "/api/task-templates",
    {
      schema: {
        operationId: "createTaskTemplate",
        summary: "Create a task template",
        description: "Register a new task template.",
        tags: ["Repos & Integrations"],
        body: createTemplateSchema,
        response: { 201: TemplateResponseSchema },
      },
    },
    async (req, reply) => {
      const workspaceId = req.user?.workspaceId ?? null;
      const template = await taskTemplateService.createTaskTemplate(req.body, workspaceId);
      reply.status(201).send({ template });
    },
  );

  app.patch(
    "/api/task-templates/:id",
    {
      schema: {
        operationId: "updateTaskTemplate",
        summary: "Update a task template",
        description: "Partial update to a task template.",
        tags: ["Repos & Integrations"],
        params: IdParamsSchema,
        body: updateTemplateSchema,
        response: { 200: TemplateResponseSchema, 404: ErrorResponseSchema },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const existing = await taskTemplateService.getTaskTemplate(id);
      if (!existing) return reply.status(404).send({ error: "Template not found" });
      const wsId = req.user?.workspaceId;
      if (wsId && existing.workspaceId && existing.workspaceId !== wsId) {
        return reply.status(404).send({ error: "Template not found" });
      }
      const template = await taskTemplateService.updateTaskTemplate(id, req.body);
      if (!template) return reply.status(404).send({ error: "Template not found" });
      reply.send({ template });
    },
  );

  app.delete(
    "/api/task-templates/:id",
    {
      schema: {
        operationId: "deleteTaskTemplate",
        summary: "Delete a task template",
        description: "Delete a task template. Returns 204 on success.",
        tags: ["Repos & Integrations"],
        params: IdParamsSchema,
        response: { 204: z.null(), 404: ErrorResponseSchema },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const existing = await taskTemplateService.getTaskTemplate(id);
      if (!existing) return reply.status(404).send({ error: "Template not found" });
      const wsId = req.user?.workspaceId;
      if (wsId && existing.workspaceId && existing.workspaceId !== wsId) {
        return reply.status(404).send({ error: "Template not found" });
      }
      await taskTemplateService.deleteTaskTemplate(id);
      reply.status(204).send(null);
    },
  );

  app.post(
    "/api/tasks/from-template/:id",
    {
      schema: {
        operationId: "createTaskFromTemplate",
        summary: "Create a task from a template",
        description:
          "Instantiate a task from a template, allowing the caller to override " +
          "title, prompt, repo/branch, agent type, priority, retries, or metadata.",
        tags: ["Repos & Integrations"],
        params: IdParamsSchema,
        body: createFromTemplateSchema,
        response: {
          201: TaskResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params;
      const overrides = req.body;

      const template = await taskTemplateService.getTaskTemplate(id);
      if (!template) return reply.status(404).send({ error: "Template not found" });
      const wsId = req.user?.workspaceId;
      if (wsId && template.workspaceId && template.workspaceId !== wsId) {
        return reply.status(404).send({ error: "Template not found" });
      }

      if (!template.repoUrl && !overrides.repoUrl) {
        return reply.status(400).send({ error: "repoUrl is required (template has no default)" });
      }

      const task = await taskService.createTask({
        title: overrides.title,
        prompt: overrides.prompt ?? template.prompt,
        repoUrl: (overrides.repoUrl ?? template.repoUrl)!,
        repoBranch: overrides.repoBranch,
        agentType: overrides.agentType ?? template.agentType,
        priority: overrides.priority ?? template.priority,
        maxRetries: overrides.maxRetries,
        metadata: overrides.metadata ?? (template.metadata as Record<string, unknown> | undefined),
        createdBy: req.user?.id,
        workspaceId: req.user?.workspaceId ?? null,
      });

      await taskService.transitionTask(task.id, TaskState.QUEUED, "task_from_template");
      await taskQueue.add(
        "process-task",
        { taskId: task.id },
        {
          jobId: task.id,
          priority: task.priority ?? 100,
          attempts: task.maxRetries + 1,
          backoff: { type: "exponential", delay: 5000 },
        },
      );

      reply.status(201).send({ task });
    },
  );
}
