ALTER TABLE "repos" ADD COLUMN "max_concurrent_tasks" integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "priority" integer DEFAULT 100 NOT NULL;