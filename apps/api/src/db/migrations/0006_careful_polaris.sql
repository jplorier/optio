ALTER TABLE "repos" ALTER COLUMN "claude_model" SET DEFAULT 'opus';--> statement-breakpoint
ALTER TABLE "repos" ALTER COLUMN "claude_context_window" SET DEFAULT '1m';--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "setup_commands" text;--> statement-breakpoint
ALTER TABLE "repos" ADD COLUMN "custom_dockerfile" text;