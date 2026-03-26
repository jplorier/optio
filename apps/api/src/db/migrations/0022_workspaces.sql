-- Workspace role enum
CREATE TYPE "public"."workspace_role" AS ENUM('admin', 'member', 'viewer');

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
