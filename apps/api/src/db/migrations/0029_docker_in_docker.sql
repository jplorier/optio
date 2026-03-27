-- Add per-repo Docker-in-Docker support via K8s user namespace isolation
ALTER TABLE "repos" ADD COLUMN IF NOT EXISTS "docker_in_docker" boolean DEFAULT false NOT NULL;
