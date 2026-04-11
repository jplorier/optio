import { z } from "zod";

/**
 * Workspace, notification, and analytics domain schemas.
 *
 * Like the integration tag, these use `z.unknown()` for response bodies
 * where the shape is rich, service-computed, or varies by caller. Request
 * schemas remain strict.
 */

export const WorkspaceSchema = z.unknown().describe("Workspace row with enrichment");

export const WorkspaceMemberSchema = z
  .unknown()
  .describe("Workspace membership row with user enrichment");

export const NotificationSubscriptionSchema = z
  .unknown()
  .describe("Web push subscription registered for a user");

export const NotificationPreferencesSchema = z
  .unknown()
  .describe("Per-event-type notification preferences for a user");

export const CostAnalyticsSchema = z
  .unknown()
  .describe(
    "Aggregated cost analytics envelope: summary, forecast, dailyCosts, " +
      "costByRepo, costByType, costByModel, anomalies, modelSuggestions, " +
      "topTasks.",
  );
