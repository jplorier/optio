CREATE TABLE "pod_health_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_pod_id" uuid NOT NULL,
	"repo_url" text NOT NULL,
	"event_type" text NOT NULL,
	"pod_name" text,
	"message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
