"use client";

import { useEffect, useState, useCallback } from "react";
import { usePageTitle } from "@/hooks/use-page-title";
import { api } from "@/lib/api-client";
import { toast } from "sonner";
import { cn, formatRelativeTime } from "@/lib/utils";
import {
  Plus,
  Loader2,
  Trash2,
  X,
  FileText,
  Github,
  MessageSquare,
  BarChart3,
  Database,
  Bug,
  FolderOpen,
  Terminal,
  Globe,
  Briefcase,
  Cloud,
  BookOpen,
  Wrench,
  Plug,
  ChevronDown,
  Eye,
  EyeOff,
  CheckCircle2,
  Zap,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PROVIDER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  notion: FileText,
  github: Github,
  slack: MessageSquare,
  linear: BarChart3,
  database: Database,
  sentry: Bug,
  folder: FolderOpen,
  terminal: Terminal,
  globe: Globe,
};

const CATEGORIES = [
  { id: "productivity", label: "Productivity", icon: Briefcase },
  { id: "database", label: "Databases", icon: Database },
  { id: "cloud", label: "Cloud", icon: Cloud },
  { id: "knowledge", label: "Knowledge", icon: BookOpen },
  { id: "custom", label: "Custom", icon: Wrench },
];

const AGENT_TYPES = [
  { value: "claude-code", label: "Claude Code" },
  { value: "codex", label: "OpenAI Codex" },
  { value: "copilot", label: "GitHub Copilot" },
  { value: "gemini", label: "Google Gemini" },
  { value: "opencode", label: "OpenCode" },
];

const PERMISSION_LEVELS = [
  { value: "read", label: "Read only" },
  { value: "readwrite", label: "Read & Write" },
  { value: "full", label: "Full access" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProviderIcon(icon?: string): React.ComponentType<{ className?: string }> {
  if (icon && PROVIDER_ICONS[icon]) return PROVIDER_ICONS[icon];
  return Plug;
}

function statusColor(status: string | undefined): string {
  if (status === "healthy" || status === "connected") return "bg-green-500";
  if (status === "error" || status === "failed") return "bg-red-500";
  return "bg-gray-400";
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ConnectionsPage() {
  usePageTitle("Connections");

  // Data
  const [providers, setProviders] = useState<any[]>([]);
  const [connections, setConnections] = useState<any[]>([]);
  const [repos, setRepos] = useState<any[]>([]);

  // UI
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<any | null>(null);
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formConfig, setFormConfig] = useState<Record<string, string>>({});
  const [formRepoScope, setFormRepoScope] = useState<"all" | "select">("all");
  const [formSelectedRepos, setFormSelectedRepos] = useState<string[]>([]);
  const [formAgentScope, setFormAgentScope] = useState<"all" | "select">("all");
  const [formSelectedAgents, setFormSelectedAgents] = useState<string[]>([]);
  const [formPermission, setFormPermission] = useState("read");
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [secretVisible, setSecretVisible] = useState<Record<string, boolean>>({});

  // ---------------------------------------------------------------------------
  // Data fetching
  // ---------------------------------------------------------------------------

  const loadData = useCallback(() => {
    Promise.all([
      api.listConnectionProviders().catch(() => ({ providers: [] })),
      api.listConnections().catch(() => ({ connections: [] })),
      api.listRepos().catch(() => ({ repos: [] })),
    ])
      .then(([provRes, connRes, repoRes]) => {
        setProviders(provRes.providers);
        setConnections(connRes.connections);
        setRepos(repoRes.repos);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const resetForm = () => {
    setFormName("");
    setFormConfig({});
    setFormRepoScope("all");
    setFormSelectedRepos([]);
    setFormAgentScope("all");
    setFormSelectedAgents([]);
    setFormPermission("read");
    setSecretVisible({});
  };

  const openSetup = (provider: any) => {
    setSelectedProvider(provider);
    resetForm();
    setFormName(provider.name ? `My ${provider.name}` : "");
    // Initialize config fields from schema
    if (provider.configSchema?.properties) {
      const init: Record<string, string> = {};
      for (const key of Object.keys(provider.configSchema.properties)) {
        init[key] = "";
      }
      setFormConfig(init);
    }
    setShowSetup(true);
  };

  const closeSetup = () => {
    setShowSetup(false);
    setSelectedProvider(null);
    resetForm();
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProvider) return;
    if (!formName.trim()) {
      toast.error("Connection name is required");
      return;
    }
    setSubmitting(true);
    try {
      await api.createConnection({
        providerId: selectedProvider.id,
        name: formName.trim(),
        config: formConfig,
        repoScope: formRepoScope,
        repoIds: formRepoScope === "select" ? formSelectedRepos : undefined,
        agentScope: formAgentScope,
        agentTypes: formAgentScope === "select" ? formSelectedAgents : undefined,
        permission: formPermission,
      });
      toast.success("Connection created", {
        description: `${formName.trim()} is ready to use.`,
      });
      closeSetup();
      loadData();
    } catch (err) {
      toast.error("Failed to create connection", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (conn: any) => {
    try {
      await api.updateConnection(conn.id, { enabled: !conn.enabled });
      toast.success(conn.enabled ? "Connection disabled" : "Connection enabled");
      loadData();
    } catch {
      toast.error("Failed to update connection");
    }
  };

  const handleDelete = async (conn: any) => {
    if (!confirm(`Delete connection "${conn.name}"? This cannot be undone.`)) return;
    try {
      await api.deleteConnection(conn.id);
      toast.success("Connection deleted");
      loadData();
    } catch {
      toast.error("Failed to delete connection");
    }
  };

  const handleTest = async (connId: string) => {
    setTesting(connId);
    try {
      const res = await api.testConnection(connId);
      if (res.status === "healthy" || res.status === "connected") {
        toast.success("Connection is healthy", { description: res.message });
      } else {
        toast.error("Connection test failed", { description: res.message });
      }
      loadData();
    } catch (err) {
      toast.error("Test failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setTesting(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------

  const groupedProviders = CATEGORIES.map((cat) => ({
    ...cat,
    providers: providers.filter((p) => p.category === cat.id),
  })).filter((g) => g.providers.length > 0);

  const filteredGroups = activeCategoryFilter
    ? groupedProviders.filter((g) => g.id === activeCategoryFilter)
    : groupedProviders;

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderScopeInfo = (conn: any) => {
    const parts: string[] = [];
    if (conn.repoScope === "all" || !conn.repoIds?.length) {
      parts.push("All repos");
    } else {
      const names = conn.repoIds
        .map((id: string) => repos.find((r) => r.id === id)?.fullName ?? id)
        .slice(0, 2);
      parts.push(
        names.join(", ") + (conn.repoIds.length > 2 ? ` +${conn.repoIds.length - 2}` : ""),
      );
    }
    if (conn.permission) {
      const perm = PERMISSION_LEVELS.find((p) => p.value === conn.permission);
      if (perm) parts.push(perm.label);
    }
    return parts.join(" · ");
  };

  const renderConfigFields = () => {
    if (!selectedProvider?.configSchema?.properties) return null;
    const props = selectedProvider.configSchema.properties as Record<string, any>;
    const required: string[] = selectedProvider.configSchema.required ?? [];

    return Object.entries(props).map(([key, schema]) => {
      const isSecret = schema.format === "secret";
      const isRequired = required.includes(key);
      const fieldId = `config-${key}`;
      const visible = secretVisible[key] ?? false;

      return (
        <div key={key}>
          <label htmlFor={fieldId} className="block text-sm text-text-muted mb-1">
            {schema.title ?? key}
            {isRequired && <span className="text-red-400 ml-0.5">*</span>}
          </label>
          {schema.description && (
            <p className="text-xs text-text-muted/70 mb-1.5">{schema.description}</p>
          )}
          <div className="relative">
            <input
              id={fieldId}
              type={isSecret && !visible ? "password" : "text"}
              required={isRequired}
              value={formConfig[key] ?? ""}
              onChange={(e) => setFormConfig((prev) => ({ ...prev, [key]: e.target.value }))}
              placeholder={schema.placeholder ?? ""}
              className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 pr-9"
              autoComplete={isSecret ? "new-password" : "off"}
            />
            {isSecret && (
              <button
                type="button"
                onClick={() => setSecretVisible((prev) => ({ ...prev, [key]: !prev[key] }))}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text"
                tabIndex={-1}
              >
                {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            )}
          </div>
        </div>
      );
    });
  };

  // ---------------------------------------------------------------------------
  // Loading state
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="p-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-center py-20 text-text-muted">
          <Loader2 className="w-5 h-5 animate-spin mr-2" />
          Loading connections...
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main render
  // ---------------------------------------------------------------------------

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="space-y-6">
        {/* ----------------------------------------------------------------- */}
        {/* Header                                                            */}
        {/* ----------------------------------------------------------------- */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-text">Connections</h1>
            <p className="text-sm text-text-muted mt-1">
              Connect external services and tools to your agents
            </p>
          </div>
          <button
            onClick={() => {
              if (providers.length > 0) {
                openSetup(providers[0]);
              } else {
                setShowSetup(true);
              }
            }}
            className="flex items-center gap-2 bg-primary text-white hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Connection
          </button>
        </div>

        {/* ----------------------------------------------------------------- */}
        {/* Active Connections                                                 */}
        {/* ----------------------------------------------------------------- */}
        {connections.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
              Active Connections
            </h2>
            <div className="space-y-2">
              {connections.map((conn) => {
                const provider = providers.find((p) => p.id === conn.providerId);
                const IconComp = getProviderIcon(provider?.icon);
                return (
                  <div
                    key={conn.id}
                    className="flex items-center justify-between p-4 bg-bg-secondary border border-border rounded-xl hover:border-border/80 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Status dot */}
                      <span
                        className={cn(
                          "w-2 h-2 rounded-full flex-shrink-0",
                          statusColor(conn.status),
                        )}
                      />
                      {/* Icon */}
                      <IconComp className="w-5 h-5 text-text-muted flex-shrink-0" />
                      {/* Info */}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text truncate">
                            {conn.name}
                          </span>
                          {provider && (
                            <span className="text-xs text-text-muted">{provider.name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-text-muted truncate">
                            {renderScopeInfo(conn)}
                          </span>
                          {conn.lastCheckedAt && (
                            <span className="text-xs text-text-muted/60">
                              Checked {formatRelativeTime(conn.lastCheckedAt)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-4">
                      {/* Test button */}
                      <button
                        onClick={() => handleTest(conn.id)}
                        disabled={testing === conn.id}
                        className="px-2.5 py-1 text-xs border border-border text-text-muted hover:bg-bg-hover rounded-lg transition-colors disabled:opacity-50"
                        title="Test connection"
                      >
                        {testing === conn.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5" />
                        )}
                      </button>
                      {/* Enable/disable toggle */}
                      <button
                        onClick={() => handleToggle(conn)}
                        className={cn(
                          "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
                          conn.enabled ? "bg-primary" : "bg-gray-500/30",
                        )}
                        title={conn.enabled ? "Disable" : "Enable"}
                      >
                        <span
                          className={cn(
                            "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
                            conn.enabled ? "translate-x-4.5" : "translate-x-1",
                          )}
                        />
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => handleDelete(conn)}
                        className="p-1.5 rounded-md hover:bg-error/10 text-text-muted hover:text-error transition-colors"
                        title="Delete connection"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Separator */}
        {connections.length > 0 && <div className="my-3 mx-1 border-t border-border/50" />}

        {/* ----------------------------------------------------------------- */}
        {/* Provider Catalog                                                   */}
        {/* ----------------------------------------------------------------- */}
        <div>
          <h2 className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-3">
            Available Providers
          </h2>

          {/* Category filter tabs */}
          {groupedProviders.length > 1 && (
            <div className="flex items-center gap-1.5 mb-4 flex-wrap">
              <button
                onClick={() => setActiveCategoryFilter(null)}
                className={cn(
                  "px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                  activeCategoryFilter === null
                    ? "bg-primary text-white"
                    : "border border-border text-text-muted hover:bg-bg-hover",
                )}
              >
                All
              </button>
              {CATEGORIES.map((cat) => {
                const hasProviders = providers.some((p) => p.category === cat.id);
                if (!hasProviders) return null;
                const CatIcon = cat.icon;
                return (
                  <button
                    key={cat.id}
                    onClick={() =>
                      setActiveCategoryFilter(activeCategoryFilter === cat.id ? null : cat.id)
                    }
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                      activeCategoryFilter === cat.id
                        ? "bg-primary text-white"
                        : "border border-border text-text-muted hover:bg-bg-hover",
                    )}
                  >
                    <CatIcon className="w-3 h-3" />
                    {cat.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* Provider grid by category */}
          {filteredGroups.length === 0 && providers.length === 0 && (
            <div className="text-center py-12 text-text-muted border border-dashed border-border rounded-lg">
              <Plug className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No providers available</p>
              <p className="text-xs mt-1">Connection providers will appear here once configured.</p>
            </div>
          )}

          {filteredGroups.map((group) => {
            const CatIcon = group.icon;
            return (
              <div key={group.id} className="mb-6">
                <div className="flex items-center gap-2 mb-2">
                  <CatIcon className="w-3.5 h-3.5 text-text-muted" />
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    {group.label}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.providers.map((provider) => {
                    const IconComp = getProviderIcon(provider.icon);
                    return (
                      <button
                        key={provider.id}
                        onClick={() => openSetup(provider)}
                        className="flex items-start gap-3 p-4 bg-bg-secondary border border-border rounded-xl hover:border-primary/40 hover:bg-bg-hover transition-colors text-left group"
                      >
                        <div className="p-2 rounded-lg bg-bg border border-border group-hover:border-primary/30 transition-colors">
                          <IconComp className="w-5 h-5 text-text-muted group-hover:text-primary transition-colors" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-text">{provider.name}</p>
                          <p className="text-xs text-text-muted mt-0.5 line-clamp-2">
                            {provider.description ?? "Connect to " + provider.name}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* =================================================================== */}
      {/* Setup Dialog                                                         */}
      {/* =================================================================== */}
      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-bg-secondary border border-border rounded-2xl shadow-xl max-w-lg w-full mx-4 max-h-[85vh] overflow-y-auto p-6">
            {/* Dialog header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                {selectedProvider && (
                  <>
                    {(() => {
                      const IconComp = getProviderIcon(selectedProvider.icon);
                      return (
                        <div className="p-2 rounded-lg bg-bg border border-border">
                          <IconComp className="w-5 h-5 text-primary" />
                        </div>
                      );
                    })()}
                    <div>
                      <h2 className="text-lg font-semibold text-text">{selectedProvider.name}</h2>
                      <p className="text-xs text-text-muted">Set up a new connection</p>
                    </div>
                  </>
                )}
                {!selectedProvider && (
                  <h2 className="text-lg font-semibold text-text">Add Connection</h2>
                )}
              </div>
              <button
                onClick={closeSetup}
                className="p-1.5 rounded-md hover:bg-bg-hover text-text-muted hover:text-text transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Provider picker (if opened without a provider) */}
            {!selectedProvider && providers.length > 0 && (
              <div className="space-y-2 mb-4">
                <p className="text-sm text-text-muted">Choose a provider to connect:</p>
                <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                  {providers.map((p) => {
                    const IconComp = getProviderIcon(p.icon);
                    return (
                      <button
                        key={p.id}
                        onClick={() => openSetup(p)}
                        className="flex items-center gap-2 p-3 rounded-lg border border-border hover:border-primary/40 hover:bg-bg-hover text-left text-sm transition-colors"
                      >
                        <IconComp className="w-4 h-4 text-text-muted" />
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Form (shown when a provider is selected) */}
            {selectedProvider && (
              <form onSubmit={handleCreate} className="space-y-4">
                {/* Description & capabilities */}
                {(selectedProvider.description || selectedProvider.capabilities?.length > 0) && (
                  <div className="rounded-lg bg-bg border border-border/50 p-3">
                    {selectedProvider.description && (
                      <p className="text-sm text-text-muted">{selectedProvider.description}</p>
                    )}
                    {selectedProvider.capabilities?.length > 0 && (
                      <ul className="mt-2 space-y-1">
                        {selectedProvider.capabilities.map((cap: string, i: number) => (
                          <li key={i} className="flex items-center gap-2 text-xs text-text-muted">
                            <CheckCircle2 className="w-3 h-3 text-green-500 flex-shrink-0" />
                            {cap}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Connection name */}
                <div>
                  <label htmlFor="conn-name" className="block text-sm text-text-muted mb-1">
                    Connection name <span className="text-red-400">*</span>
                  </label>
                  <input
                    id="conn-name"
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Production Notion"
                    className="w-full px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20"
                  />
                </div>

                {/* Dynamic config fields */}
                {renderConfigFields()}

                <div className="my-3 mx-1 border-t border-border/50" />

                {/* Access control: repos */}
                <div>
                  <label className="block text-sm font-medium text-text mb-2">
                    Repository access
                  </label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-text-muted">
                      <input
                        type="radio"
                        name="repoScope"
                        checked={formRepoScope === "all"}
                        onChange={() => setFormRepoScope("all")}
                        className="accent-primary"
                      />
                      All repos
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-text-muted">
                      <input
                        type="radio"
                        name="repoScope"
                        checked={formRepoScope === "select"}
                        onChange={() => setFormRepoScope("select")}
                        className="accent-primary"
                      />
                      Select repos...
                    </label>
                    {formRepoScope === "select" && (
                      <div className="ml-6 space-y-1.5 max-h-36 overflow-y-auto rounded-lg border border-border/50 bg-bg p-2">
                        {repos.length === 0 && (
                          <p className="text-xs text-text-muted py-1">No repos configured yet.</p>
                        )}
                        {repos.map((repo) => (
                          <label
                            key={repo.id}
                            className="flex items-center gap-2 cursor-pointer text-xs text-text-muted hover:text-text"
                          >
                            <input
                              type="checkbox"
                              checked={formSelectedRepos.includes(repo.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormSelectedRepos((prev) => [...prev, repo.id]);
                                } else {
                                  setFormSelectedRepos((prev) =>
                                    prev.filter((id) => id !== repo.id),
                                  );
                                }
                              }}
                              className="accent-primary rounded"
                            />
                            {repo.fullName ?? repo.repoUrl}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Access control: agents */}
                <div>
                  <label className="block text-sm font-medium text-text mb-2">Agent access</label>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-text-muted">
                      <input
                        type="radio"
                        name="agentScope"
                        checked={formAgentScope === "all"}
                        onChange={() => setFormAgentScope("all")}
                        className="accent-primary"
                      />
                      All agents
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-text-muted">
                      <input
                        type="radio"
                        name="agentScope"
                        checked={formAgentScope === "select"}
                        onChange={() => setFormAgentScope("select")}
                        className="accent-primary"
                      />
                      Select agents...
                    </label>
                    {formAgentScope === "select" && (
                      <div className="ml-6 space-y-1.5 rounded-lg border border-border/50 bg-bg p-2">
                        {AGENT_TYPES.map((agent) => (
                          <label
                            key={agent.value}
                            className="flex items-center gap-2 cursor-pointer text-xs text-text-muted hover:text-text"
                          >
                            <input
                              type="checkbox"
                              checked={formSelectedAgents.includes(agent.value)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormSelectedAgents((prev) => [...prev, agent.value]);
                                } else {
                                  setFormSelectedAgents((prev) =>
                                    prev.filter((v) => v !== agent.value),
                                  );
                                }
                              }}
                              className="accent-primary rounded"
                            />
                            {agent.label}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Permission level */}
                <div>
                  <label htmlFor="permission" className="block text-sm font-medium text-text mb-2">
                    Permission level
                  </label>
                  <div className="relative">
                    <select
                      id="permission"
                      value={formPermission}
                      onChange={(e) => setFormPermission(e.target.value)}
                      className="w-full appearance-none px-3 py-2 rounded-lg bg-bg border border-border text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/20 pr-8"
                    >
                      {PERMISSION_LEVELS.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                  </div>
                </div>

                <div className="my-3 mx-1 border-t border-border/50" />

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={closeSetup}
                    className="border border-border text-text-muted hover:bg-bg-hover rounded-lg px-4 py-2 text-sm transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-primary text-white hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {submitting ? "Saving..." : "Save Connection"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
