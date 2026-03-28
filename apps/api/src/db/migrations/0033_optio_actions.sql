CREATE TABLE IF NOT EXISTS "optio_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"params" jsonb,
	"result" jsonb,
	"success" boolean NOT NULL,
	"conversation_snippet" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "optio_actions" ADD CONSTRAINT "optio_actions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optio_actions_user_id_idx" ON "optio_actions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optio_actions_action_idx" ON "optio_actions" USING btree ("action");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "optio_actions_created_at_idx" ON "optio_actions" USING btree ("created_at" DESC NULLS LAST);
