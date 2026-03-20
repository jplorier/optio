ALTER TABLE "repos" ADD COLUMN "auto_resume_on_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "pr_number" integer;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "pr_state" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "pr_checks_status" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "pr_review_status" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "pr_review_comments" text;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "cost_usd" text;