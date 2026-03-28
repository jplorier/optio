import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as optioSettingsService from "../services/optio-settings-service.js";

const updateSettingsSchema = z.object({
  model: z.enum(["opus", "sonnet", "haiku"]).optional(),
  systemPrompt: z.string().optional(),
  enabledTools: z.array(z.string()).min(1, "At least one tool must be enabled").optional(),
  confirmWrites: z.boolean().optional(),
  maxTurns: z.number().int().min(5).max(50).optional(),
});

export async function optioSettingsRoutes(app: FastifyInstance) {
  // Get current settings
  app.get("/api/optio/settings", async (req, reply) => {
    const workspaceId = req.user?.workspaceId ?? null;
    const settings = await optioSettingsService.getSettings(workspaceId);
    reply.send({ settings });
  });

  // Update settings (upsert)
  app.put("/api/optio/settings", async (req, reply) => {
    const input = updateSettingsSchema.parse(req.body);
    const workspaceId = req.user?.workspaceId ?? null;
    const settings = await optioSettingsService.upsertSettings(input, workspaceId);
    reply.send({ settings });
  });
}
