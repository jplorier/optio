-- External (non-optio-authored) PR auto-review.
--
-- Adds per-repo config for automatically reviewing PRs that weren't opened by
-- an optio task, plus the state machine additions needed to hold a review in
-- Optio (on_pr_hold) or auto-post to GitHub/GitLab (on_pr_post), and to chat
-- with the agent afterwards via session resume.

-- Per-repo config
ALTER TABLE "repos"
  ADD COLUMN "external_review_mode" text NOT NULL DEFAULT 'off',
  ADD COLUMN "external_review_filters" jsonb,
  ADD COLUMN "external_review_wait_for_ci" boolean NOT NULL DEFAULT true;

-- Review draft additions: origin, userEngaged, autoSubmitted.
-- Also make task_id nullable (a waiting_ci draft has no task until CI clears)
-- and add the "waiting_ci" enum value.
ALTER TYPE "review_draft_state" ADD VALUE IF NOT EXISTS 'waiting_ci' BEFORE 'drafting';

ALTER TABLE "review_drafts"
  ALTER COLUMN "task_id" DROP NOT NULL,
  ADD COLUMN "origin" text NOT NULL DEFAULT 'manual',
  ADD COLUMN "user_engaged" boolean NOT NULL DEFAULT false,
  ADD COLUMN "auto_submitted" boolean NOT NULL DEFAULT false;

-- Chat messages: each turn of the user<->agent conversation on a review draft.
CREATE TYPE "review_chat_message_role" AS ENUM ('user', 'assistant');

CREATE TABLE "review_chat_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "draft_id" uuid NOT NULL REFERENCES "review_drafts"("id") ON DELETE CASCADE,
  "role" "review_chat_message_role" NOT NULL,
  "content" text NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT NOW()
);

CREATE INDEX "review_chat_messages_draft_id_idx" ON "review_chat_messages" ("draft_id");
