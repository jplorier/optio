export interface McpServerConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  env?: Record<string, string> | null;
  installCommand?: string | null;
  scope: string; // "global" or repo URL
  repoUrl?: string | null;
  workspaceId?: string | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMcpServerInput {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  installCommand?: string;
  repoUrl?: string;
  enabled?: boolean;
}

export interface UpdateMcpServerInput {
  name?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string> | null;
  installCommand?: string | null;
  enabled?: boolean;
}

/**
 * Layout discriminator for a custom skill:
 *  - "commands"  → written to `.claude/commands/<name>.md` (legacy single-file).
 *  - "skill-dir" → written to `.claude/skills/<name>/SKILL.md`, plus any
 *                  `files` entries resolved under `.claude/skills/<name>/`.
 */
export type CustomSkillLayout = "commands" | "skill-dir";

export interface CustomSkillFile {
  /** Relative path under `.claude/skills/<name>/`. Forward slashes only. */
  relativePath: string;
  content: string;
}

export interface CustomSkillConfig {
  id: string;
  name: string;
  description?: string | null;
  prompt: string;
  scope: string; // "global" or repo URL
  repoUrl?: string | null;
  workspaceId?: string | null;
  layout: CustomSkillLayout;
  /** Extra files for skill-dir layout. Null/empty = none. */
  files?: CustomSkillFile[] | null;
  /** Agent types this skill applies to. null/empty = all agent types. */
  agentTypes?: string[] | null;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomSkillInput {
  name: string;
  description?: string;
  prompt: string;
  repoUrl?: string;
  layout?: CustomSkillLayout;
  files?: CustomSkillFile[];
  agentTypes?: string[];
  enabled?: boolean;
}

export interface UpdateCustomSkillInput {
  name?: string;
  description?: string | null;
  prompt?: string;
  layout?: CustomSkillLayout;
  files?: CustomSkillFile[] | null;
  agentTypes?: string[] | null;
  enabled?: boolean;
}
