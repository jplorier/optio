import type { FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "../db/client.js";

export async function analyticsRoutes(app: FastifyInstance) {
  // Cost analytics — aggregated cost data for the dashboard
  app.get("/api/analytics/costs", async (req, reply) => {
    const query = req.query as { days?: string; repoUrl?: string };
    const days = query.days ? parseInt(query.days, 10) : 30;
    const repoUrl = query.repoUrl || null;

    const repoFilter = repoUrl ? sql`AND repo_url = ${repoUrl}` : sql``;

    const dateFilter = sql`AND created_at >= NOW() - ${sql.raw(`INTERVAL '${days} days'`)}`;

    // Total cost and task count
    const [totals] = await db.execute<{
      total_cost: string;
      task_count: string;
      tasks_with_cost: string;
    }>(sql`
      SELECT
        COALESCE(SUM(CAST(cost_usd AS NUMERIC)), 0) AS total_cost,
        COUNT(*) AS task_count,
        COUNT(cost_usd) AS tasks_with_cost
      FROM tasks
      WHERE cost_usd IS NOT NULL
        ${dateFilter}
        ${repoFilter}
    `);

    // Previous period for trend comparison
    const [prevTotals] = await db.execute<{
      total_cost: string;
    }>(sql`
      SELECT
        COALESCE(SUM(CAST(cost_usd AS NUMERIC)), 0) AS total_cost
      FROM tasks
      WHERE cost_usd IS NOT NULL
        AND created_at >= NOW() - ${sql.raw(`INTERVAL '${days * 2} days'`)}
        AND created_at < NOW() - ${sql.raw(`INTERVAL '${days} days'`)}
        ${repoFilter}
    `);

    // Daily cost over time
    const dailyCosts = await db.execute<{
      date: string;
      cost: string;
      task_count: string;
    }>(sql`
      SELECT
        DATE(created_at) AS date,
        COALESCE(SUM(CAST(cost_usd AS NUMERIC)), 0) AS cost,
        COUNT(*) AS task_count
      FROM tasks
      WHERE cost_usd IS NOT NULL
        ${dateFilter}
        ${repoFilter}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Cost by repo
    const costByRepo = await db.execute<{
      repo_url: string;
      total_cost: string;
      task_count: string;
    }>(sql`
      SELECT
        repo_url,
        COALESCE(SUM(CAST(cost_usd AS NUMERIC)), 0) AS total_cost,
        COUNT(*) AS task_count
      FROM tasks
      WHERE cost_usd IS NOT NULL
        ${dateFilter}
        ${repoFilter}
      GROUP BY repo_url
      ORDER BY total_cost DESC
    `);

    // Cost by task type
    const costByType = await db.execute<{
      task_type: string;
      total_cost: string;
      task_count: string;
    }>(sql`
      SELECT
        task_type,
        COALESCE(SUM(CAST(cost_usd AS NUMERIC)), 0) AS total_cost,
        COUNT(*) AS task_count
      FROM tasks
      WHERE cost_usd IS NOT NULL
        ${dateFilter}
        ${repoFilter}
      GROUP BY task_type
      ORDER BY total_cost DESC
    `);

    // Top most expensive tasks
    const topTasks = await db.execute<{
      id: string;
      title: string;
      repo_url: string;
      task_type: string;
      state: string;
      cost_usd: string;
      created_at: string;
    }>(sql`
      SELECT id, title, repo_url, task_type, state, cost_usd, created_at
      FROM tasks
      WHERE cost_usd IS NOT NULL
        ${dateFilter}
        ${repoFilter}
      ORDER BY CAST(cost_usd AS NUMERIC) DESC
      LIMIT 10
    `);

    const totalCost = parseFloat(totals.total_cost) || 0;
    const prevCost = parseFloat(prevTotals.total_cost) || 0;
    const taskCount = parseInt(totals.task_count) || 0;
    const tasksWithCost = parseInt(totals.tasks_with_cost) || 0;
    const avgCost = tasksWithCost > 0 ? totalCost / tasksWithCost : 0;
    const costTrend = prevCost > 0 ? ((totalCost - prevCost) / prevCost) * 100 : 0;

    reply.send({
      summary: {
        totalCost: totalCost.toFixed(4),
        taskCount,
        tasksWithCost,
        avgCost: avgCost.toFixed(4),
        costTrend: costTrend.toFixed(1),
        prevPeriodCost: prevCost.toFixed(4),
        days,
      },
      dailyCosts: dailyCosts.map((r) => ({
        date: r.date,
        cost: parseFloat(r.cost) || 0,
        taskCount: parseInt(r.task_count) || 0,
      })),
      costByRepo: costByRepo.map((r) => ({
        repoUrl: r.repo_url,
        totalCost: parseFloat(r.total_cost) || 0,
        taskCount: parseInt(r.task_count) || 0,
      })),
      costByType: costByType.map((r) => ({
        taskType: r.task_type,
        totalCost: parseFloat(r.total_cost) || 0,
        taskCount: parseInt(r.task_count) || 0,
      })),
      topTasks: topTasks.map((r) => ({
        id: r.id,
        title: r.title,
        repoUrl: r.repo_url,
        taskType: r.task_type,
        state: r.state,
        costUsd: r.cost_usd,
        createdAt: r.created_at,
      })),
    });
  });
}
