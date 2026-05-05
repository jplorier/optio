-- Phase 1 of community-skills (issue #497):
-- Extend custom_skills with multi-file + agent-type-scoped support.
--
--   layout       discriminator: "commands" (legacy, .claude/commands/<name>.md)
--                or "skill-dir" (.claude/skills/<name>/SKILL.md + extras)
--   files        jsonb array of { relativePath, content } resolved under
--                .claude/skills/<name>/ when layout = "skill-dir"
--   agent_types  jsonb string[]; null/empty = applies to all agent types
--
-- Existing rows default to layout="commands" and unbounded agent scope, so
-- behavior is preserved.

ALTER TABLE "custom_skills"
  ADD COLUMN "layout" text NOT NULL DEFAULT 'commands';

ALTER TABLE "custom_skills"
  ADD COLUMN "files" jsonb;

ALTER TABLE "custom_skills"
  ADD COLUMN "agent_types" jsonb;
