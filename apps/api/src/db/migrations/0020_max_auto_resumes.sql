-- Add configurable auto-resume limit per repo (nullable, falls back to env var or default of 10)
ALTER TABLE "repos" ADD COLUMN IF NOT EXISTS "max_auto_resumes" integer;
