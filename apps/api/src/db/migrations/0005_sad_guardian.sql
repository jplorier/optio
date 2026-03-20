ALTER TABLE "repos" ADD COLUMN "claude_model" text DEFAULT 'sonnet';--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "claude_context_window" text DEFAULT '200k';--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "claude_thinking" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "claude_effort" text DEFAULT 'high';