CREATE TABLE IF NOT EXISTS "optio_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model" text DEFAULT 'sonnet' NOT NULL,
	"system_prompt" text DEFAULT '' NOT NULL,
	"enabled_tools" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confirm_writes" boolean DEFAULT true NOT NULL,
	"max_turns" integer DEFAULT 20 NOT NULL,
	"workspace_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optio_settings_workspace_id_idx" ON "optio_settings" USING btree ("workspace_id");
