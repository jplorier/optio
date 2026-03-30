-- Review Drafts for PR Review Assistant
DO $$ BEGIN
  CREATE TYPE "public"."review_draft_state" AS ENUM('drafting', 'ready', 'submitted', 'stale');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "review_drafts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "task_id" uuid NOT NULL REFERENCES "tasks"("id") ON DELETE CASCADE,
  "pr_url" text NOT NULL,
  "pr_number" integer NOT NULL,
  "repo_owner" text NOT NULL,
  "repo_name" text NOT NULL,
  "head_sha" text NOT NULL,
  "state" "review_draft_state" NOT NULL DEFAULT 'drafting',
  "verdict" text,
  "summary" text,
  "file_comments" jsonb,
  "submitted_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "review_drafts_task_id_idx" ON "review_drafts" ("task_id");
CREATE INDEX IF NOT EXISTS "review_drafts_state_idx" ON "review_drafts" ("state");
