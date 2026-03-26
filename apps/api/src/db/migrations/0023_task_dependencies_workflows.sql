-- Add waiting_on_deps to task_state enum
ALTER TYPE "task_state" ADD VALUE IF NOT EXISTS 'waiting_on_deps' BEFORE 'queued';
--> statement-breakpoint

-- Add workflow_run_id column to tasks
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "workflow_run_id" uuid;
--> statement-breakpoint

-- Task dependencies table (DAG edges for task-to-task dependencies)
CREATE TABLE IF NOT EXISTS "task_dependencies" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "depends_on_task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "task_deps_unique" UNIQUE("task_id", "depends_on_task_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_deps_task_id_idx" ON "task_dependencies" USING btree ("task_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "task_deps_depends_on_idx" ON "task_dependencies" USING btree ("depends_on_task_id");
--> statement-breakpoint

-- Workflow templates table
CREATE TABLE IF NOT EXISTS "workflow_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "workspace_id" uuid,
  "steps" jsonb NOT NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

-- Workflow runs table
CREATE TABLE IF NOT EXISTS "workflow_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "workflow_template_id" uuid NOT NULL REFERENCES "workflow_templates"("id") ON DELETE CASCADE,
  "workspace_id" uuid,
  "status" text NOT NULL DEFAULT 'running',
  "task_mapping" jsonb,
  "created_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "workflow_runs_template_id_idx" ON "workflow_runs" USING btree ("workflow_template_id");
