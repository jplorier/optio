"use client";

import { useEffect, useState, useCallback } from "react";
import { api } from "@/lib/api-client";
import { cn, formatRelativeTime, truncate } from "@/lib/utils";
import Link from "next/link";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Activity,
  Loader2,
  ArrowUpRight,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";

type CostAnalytics = Awaited<ReturnType<typeof api.getCostAnalytics>>;

const PERIOD_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
];

const REPO_COLORS = [
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#06b6d4", // cyan
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#ec4899", // pink
  "#14b8a6", // teal
];

function repoShortName(repoUrl: string): string {
  const match = repoUrl.match(/([^/]+\/[^/]+?)(?:\.git)?$/);
  return match ? match[1] : repoUrl;
}

function formatCost(value: string | number): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(n) || n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  trend,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: any;
  trend?: { value: number; label: string };
}) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-text-muted font-medium uppercase tracking-wider">
          {label}
        </span>
        <Icon className="w-4 h-4 text-text-muted" />
      </div>
      <div className="text-2xl font-semibold text-text">{value}</div>
      {(sub || trend) && (
        <div className="mt-1.5 flex items-center gap-2">
          {trend && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-xs font-medium",
                trend.value > 0
                  ? "text-error"
                  : trend.value < 0
                    ? "text-success"
                    : "text-text-muted",
              )}
            >
              {trend.value > 0 ? (
                <TrendingUp className="w-3 h-3" />
              ) : trend.value < 0 ? (
                <TrendingDown className="w-3 h-3" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
              {trend.value > 0 ? "+" : ""}
              {trend.value.toFixed(1)}%
            </span>
          )}
          {sub && <span className="text-xs text-text-muted">{sub}</span>}
        </div>
      )}
    </div>
  );
}

function ChartTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-bg-card border border-border rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-text-muted mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-medium" style={{ color: p.color }}>
          {p.name}: {p.name === "Tasks" ? p.value : formatCost(p.value)}
        </p>
      ))}
    </div>
  );
}

export default function CostsPage() {
  const [data, setData] = useState<CostAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);
  const [repoFilter, setRepoFilter] = useState<string>("");
  const [repos, setRepos] = useState<Array<{ repoUrl: string }>>([]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params: { days: number; repoUrl?: string } = { days };
      if (repoFilter) params.repoUrl = repoFilter;
      const result = await api.getCostAnalytics(params);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, [days, repoFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load repos for filter dropdown
  useEffect(() => {
    api
      .listRepos()
      .then((res) => setRepos(res.repos))
      .catch(() => {});
  }, []);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <p className="text-text-muted mb-2">{error}</p>
          <button onClick={loadData} className="text-sm text-primary hover:underline">
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { summary, dailyCosts, costByRepo, costByType, topTasks } = data;
  const trend = parseFloat(summary.costTrend);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text">Cost Analytics</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Track and analyze agent spend across your tasks
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Repo filter */}
          <select
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            className="bg-bg-card border border-border rounded-lg px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">All repos</option>
            {repos.map((r: any) => (
              <option key={r.repoUrl} value={r.repoUrl}>
                {r.fullName || repoShortName(r.repoUrl)}
              </option>
            ))}
          </select>
          {/* Period selector */}
          <div className="flex bg-bg-card border border-border rounded-lg overflow-hidden">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                onClick={() => setDays(opt.days)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium transition-colors",
                  days === opt.days
                    ? "bg-primary text-white"
                    : "text-text-muted hover:text-text hover:bg-bg-hover",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Total Spend"
          value={formatCost(summary.totalCost)}
          icon={DollarSign}
          trend={{ value: trend, label: "vs prev period" }}
          sub={`last ${summary.days}d`}
        />
        <StatCard
          label="Average Cost"
          value={formatCost(summary.avgCost)}
          icon={BarChart3}
          sub={`across ${summary.tasksWithCost} tasks`}
        />
        <StatCard
          label="Tasks with Cost"
          value={String(summary.tasksWithCost)}
          icon={Activity}
          sub={`of ${summary.taskCount} total`}
        />
        <StatCard
          label="Prev Period"
          value={formatCost(summary.prevPeriodCost)}
          icon={DollarSign}
          sub={`previous ${summary.days}d`}
        />
      </div>

      {/* Cost over time chart */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-text mb-4">Cost Over Time</h2>
        {dailyCosts.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-text-muted text-sm">
            No cost data for this period
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={dailyCosts}>
              <defs>
                <linearGradient id="costGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => {
                  const d = new Date(v);
                  return `${d.getMonth() + 1}/${d.getDate()}`;
                }}
              />
              <YAxis
                tick={{ fill: "#6b7280", fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip content={<ChartTooltipContent />} />
              <Area
                type="monotone"
                dataKey="cost"
                name="Cost"
                stroke="#6366f1"
                fill="url(#costGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two-column layout: Cost by Repo + Cost by Type */}
      <div className="grid grid-cols-2 gap-4">
        {/* Cost by repo */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-text mb-4">Cost by Repository</h2>
          {costByRepo.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">
              No data
            </div>
          ) : (
            <div className="space-y-3">
              {costByRepo.map((r, i) => {
                const maxCost = costByRepo[0]?.totalCost || 1;
                const pct = (r.totalCost / maxCost) * 100;
                return (
                  <div key={r.repoUrl}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-text truncate max-w-[60%]">
                        {repoShortName(r.repoUrl)}
                      </span>
                      <span className="text-xs text-text-muted">
                        {formatCost(r.totalCost)} ({r.taskCount} tasks)
                      </span>
                    </div>
                    <div className="h-2 bg-bg rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: REPO_COLORS[i % REPO_COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cost by task type */}
        <div className="bg-bg-card border border-border rounded-xl p-5">
          <h2 className="text-sm font-medium text-text mb-4">Cost by Task Type</h2>
          {costByType.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-text-muted text-sm">
              No data
            </div>
          ) : (
            <div>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie
                    data={costByType.map((t) => ({
                      name: t.taskType,
                      value: t.totalCost,
                    }))}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={75}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {costByType.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "#6366f1" : "#8b5cf6"} stroke="none" />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => formatCost(Number(value))}
                    contentStyle={{
                      backgroundColor: "var(--color-bg-card, #1a1a2e)",
                      border: "1px solid var(--color-border, #2a2a3e)",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-6 mt-2">
                {costByType.map((t, i) => (
                  <div key={t.taskType} className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: i === 0 ? "#6366f1" : "#8b5cf6" }}
                    />
                    <span className="text-xs text-text-muted">
                      {t.taskType} — {formatCost(t.totalCost)} ({t.taskCount})
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top most expensive tasks */}
      <div className="bg-bg-card border border-border rounded-xl p-5">
        <h2 className="text-sm font-medium text-text mb-4">Most Expensive Tasks</h2>
        {topTasks.length === 0 ? (
          <div className="py-8 text-center text-text-muted text-sm">No tasks with cost data</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">Task</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">Repo</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">Type</th>
                  <th className="text-left py-2 px-3 text-xs font-medium text-text-muted">State</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-text-muted">Cost</th>
                  <th className="text-right py-2 px-3 text-xs font-medium text-text-muted">When</th>
                </tr>
              </thead>
              <tbody>
                {topTasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-border/50 hover:bg-bg-hover transition-colors"
                  >
                    <td className="py-2.5 px-3">
                      <Link
                        href={`/tasks/${task.id}`}
                        className="text-text hover:text-primary flex items-center gap-1"
                      >
                        {truncate(task.title, 50)}
                        <ArrowUpRight className="w-3 h-3 text-text-muted" />
                      </Link>
                    </td>
                    <td className="py-2.5 px-3 text-text-muted text-xs">
                      {repoShortName(task.repoUrl)}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded-full",
                          task.taskType === "review"
                            ? "bg-violet-500/10 text-violet-400"
                            : "bg-indigo-500/10 text-indigo-400",
                        )}
                      >
                        {task.taskType}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="text-xs text-text-muted">{task.state}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-medium text-text">
                      {formatCost(task.costUsd)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-xs text-text-muted">
                      {formatRelativeTime(task.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
