-- Ensure prerequisite tables exist (0016_notification_webhooks was not in the journal)
DO $$ BEGIN
  CREATE TYPE "public"."webhook_event" AS ENUM('task.completed', 'task.failed', 'task.needs_attention', 'task.pr_opened', 'review.completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "webhooks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "url" text NOT NULL,
  "events" jsonb NOT NULL,
  "secret" text,
  "description" text,
  "active" boolean NOT NULL DEFAULT true,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "webhook_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "webhook_id" uuid NOT NULL REFERENCES "webhooks"("id") ON DELETE CASCADE,
  "event" text NOT NULL,
  "payload" jsonb NOT NULL,
  "status_code" integer,
  "response_body" text,
  "success" boolean NOT NULL DEFAULT false,
  "attempt" integer NOT NULL DEFAULT 1,
  "error" text,
  "delivered_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Ensure interactive_sessions tables exist (0018_interactive_sessions was not in the journal)
DO $$ BEGIN
  CREATE TYPE "interactive_session_state" AS ENUM('active', 'ended');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "interactive_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "repo_url" text NOT NULL,
  "user_id" uuid,
  "worktree_path" text,
  "branch" text NOT NULL,
  "state" "interactive_session_state" DEFAULT 'active' NOT NULL,
  "pod_id" uuid,
  "cost_usd" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "ended_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "interactive_sessions_repo_url_idx" ON "interactive_sessions" ("repo_url");
CREATE INDEX IF NOT EXISTS "interactive_sessions_state_idx" ON "interactive_sessions" ("state");
CREATE INDEX IF NOT EXISTS "interactive_sessions_user_id_idx" ON "interactive_sessions" ("user_id");

CREATE TABLE IF NOT EXISTS "session_prs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "session_id" uuid NOT NULL REFERENCES "interactive_sessions"("id") ON DELETE CASCADE,
  "pr_url" text NOT NULL,
  "pr_number" integer NOT NULL,
  "pr_state" text,
  "pr_checks_status" text,
  "pr_review_status" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "session_prs_session_id_idx" ON "session_prs" ("session_id");
--> statement-breakpoint
-- Ensure task_comments table exists (0019_task_comments_activity was not in the journal)
CREATE TABLE IF NOT EXISTS "task_comments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id"),
  "user_id" uuid,
  "content" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "task_comments_task_id_idx" ON "task_comments" USING btree ("task_id");

ALTER TABLE "task_events" ADD COLUMN IF NOT EXISTS "user_id" uuid;
--> statement-breakpoint
-- Workspace role enum
DO $$ BEGIN
  CREATE TYPE "public"."workspace_role" AS ENUM('admin', 'member', 'viewer');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Workspaces table
CREATE TABLE IF NOT EXISTS "workspaces" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "description" text,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);

-- Workspace members junction table
CREATE TABLE IF NOT EXISTS "workspace_members" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" "workspace_role" DEFAULT 'member' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "workspace_members_workspace_user_key" UNIQUE("workspace_id", "user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_members_user_idx" ON "workspace_members" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workspace_members_workspace_idx" ON "workspace_members" USING btree ("workspace_id");

-- Add workspace_id columns to existing tables (nullable for backward compat)
ALTER TABLE "tasks" ADD COLUMN "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "secrets" ADD COLUMN "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "repo_pods" ADD COLUMN "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "webhooks" ADD COLUMN "workspace_id" uuid;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "default_workspace_id" uuid;

-- Add indexes for workspace-scoped queries
CREATE INDEX IF NOT EXISTS "tasks_workspace_id_idx" ON "tasks" USING btree ("workspace_id");

-- Update unique constraints to include workspace_id
-- Drop old constraints and replace with workspace-scoped ones
ALTER TABLE "secrets" DROP CONSTRAINT IF EXISTS "secrets_name_scope_key";
--> statement-breakpoint
ALTER TABLE "secrets" ADD CONSTRAINT "secrets_name_scope_ws_key" UNIQUE("name", "scope", "workspace_id");
--> statement-breakpoint
ALTER TABLE "repos" DROP CONSTRAINT IF EXISTS "repos_repo_url_unique";
--> statement-breakpoint
ALTER TABLE "repos" ADD CONSTRAINT "repos_url_workspace_key" UNIQUE("repo_url", "workspace_id");

-- Create a default workspace and assign all existing data to it
DO $$
DECLARE
  default_ws_id uuid;
BEGIN
  INSERT INTO "workspaces" ("id", "name", "slug", "description")
  VALUES (gen_random_uuid(), 'Default', 'default', 'Default workspace for existing data')
  RETURNING "id" INTO default_ws_id;

  -- Assign all existing resources to the default workspace
  UPDATE "tasks" SET "workspace_id" = default_ws_id WHERE "workspace_id" IS NULL;
  UPDATE "repos" SET "workspace_id" = default_ws_id WHERE "workspace_id" IS NULL;
  UPDATE "secrets" SET "workspace_id" = default_ws_id WHERE "workspace_id" IS NULL;
  UPDATE "repo_pods" SET "workspace_id" = default_ws_id WHERE "workspace_id" IS NULL;
  UPDATE "webhooks" SET "workspace_id" = default_ws_id WHERE "workspace_id" IS NULL;

  -- Add all existing users as admin of the default workspace
  INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
  SELECT default_ws_id, "id", 'admin' FROM "users";

  -- Set default workspace for all users
  UPDATE "users" SET "default_workspace_id" = default_ws_id;
END $$;
