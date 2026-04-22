import { Queue, Worker } from "bullmq";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import { repos, reviewDrafts, tasks } from "../db/schema.js";
import { parseIntEnv, parseRepoUrl } from "@optio/shared";
import { getGitPlatformForRepo } from "../services/git-token-service.js";
import { launchPrReview } from "../services/pr-review-service.js";
import { logger } from "../logger.js";
import { getBullMQConnectionOptions } from "../services/redis-config.js";
import { instrumentWorkerProcessor } from "../telemetry/instrument-worker.js";
import { determineCheckStatus } from "./pr-watcher-worker.js";

const connectionOpts = getBullMQConnectionOptions();

export const externalPrReviewQueue = new Queue("external-pr-review", {
  connection: connectionOpts,
});

type Filters = NonNullable<(typeof repos.$inferSelect)["externalReviewFilters"]>;

function passesFilters(
  pr: {
    draft: boolean;
    author: string | null;
    labels: string[];
  },
  filters: Filters | null,
): boolean {
  if (!filters) return true;
  if (filters.skipDrafts && pr.draft) return false;

  const author = pr.author ?? "";
  if (filters.includeAuthors && filters.includeAuthors.length > 0) {
    if (!author || !filters.includeAuthors.includes(author)) return false;
  }
  if (filters.excludeAuthors && filters.excludeAuthors.includes(author)) return false;

  const labels = pr.labels ?? [];
  if (filters.includeLabels && filters.includeLabels.length > 0) {
    if (!labels.some((l) => filters.includeLabels!.includes(l))) return false;
  }
  if (filters.excludeLabels && labels.some((l) => filters.excludeLabels!.includes(l))) return false;

  return true;
}

async function isOptioAuthored(prUrl: string): Promise<boolean> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.prUrl, prUrl), sql`${tasks.taskType} != 'pr_review'`))
    .limit(1);
  return !!row;
}

export function startExternalPrReviewWorker() {
  externalPrReviewQueue.add(
    "poll-external-prs",
    {},
    {
      repeat: {
        every: parseIntEnv("OPTIO_EXTERNAL_PR_POLL_INTERVAL_MS", 120_000),
      },
    },
  );

  const worker = new Worker(
    "external-pr-review",
    instrumentWorkerProcessor("external-pr-review", async () => {
      const activeRepos = await db
        .select()
        .from(repos)
        .where(
          sql`${repos.externalReviewMode} IN ('on_pr_hold', 'on_pr_post') AND ${repos.reviewEnabled} = true`,
        );

      for (const repo of activeRepos) {
        try {
          const ri = parseRepoUrl(repo.repoUrl);
          if (!ri) continue;

          const { platform } = await getGitPlatformForRepo(repo.repoUrl, { server: true }).catch(
            () => ({ platform: null as any }),
          );
          if (!platform) continue;

          const prs = await platform.listOpenPullRequests(ri, { perPage: 50 }).catch(() => []);
          if (prs.length === 0) continue;

          // Load existing drafts for these PRs in one query
          const prUrls = prs.map((p: { url: string }) => p.url);
          const drafts = prUrls.length
            ? await db.select().from(reviewDrafts).where(inArray(reviewDrafts.prUrl, prUrls))
            : [];
          const draftByUrl = new Map(drafts.map((d) => [d.prUrl, d]));

          const filters = repo.externalReviewFilters ?? null;

          for (const pr of prs) {
            try {
              const existing = draftByUrl.get(pr.url);

              // Existing draft logic first — even if filters change we don't
              // rip out an in-flight review.
              if (existing) {
                if (existing.state === "drafting") continue;
                if (existing.state === "submitted") {
                  // New commits after an auto-submit + user hasn't engaged → re-run.
                  if (
                    existing.origin === "auto" &&
                    !existing.userEngaged &&
                    pr.headSha &&
                    pr.headSha !== existing.headSha
                  ) {
                    await launchPrReview({
                      prUrl: pr.url,
                      workspaceId: repo.workspaceId ?? undefined,
                      origin: "auto",
                      existingDraftId: existing.id,
                    });
                  }
                  continue;
                }
                if (existing.state === "ready" || existing.state === "stale") {
                  if (pr.headSha && pr.headSha !== existing.headSha) {
                    if (existing.origin === "auto" && !existing.userEngaged) {
                      await launchPrReview({
                        prUrl: pr.url,
                        workspaceId: repo.workspaceId ?? undefined,
                        origin: "auto",
                        existingDraftId: existing.id,
                      });
                    } else if (existing.state !== "stale") {
                      await db
                        .update(reviewDrafts)
                        .set({ state: "stale", updatedAt: new Date() })
                        .where(eq(reviewDrafts.id, existing.id));
                    }
                  }
                  continue;
                }
                if (existing.state === "waiting_ci") {
                  // Re-check CI and promote if clear
                  const checks = await platform.getCIChecks(ri, pr.headSha).catch(() => []);
                  const status = determineCheckStatus(checks);
                  if (status !== "pending") {
                    await launchPrReview({
                      prUrl: pr.url,
                      workspaceId: repo.workspaceId ?? undefined,
                      origin: "auto",
                      existingDraftId: existing.id,
                    });
                  }
                  continue;
                }
              }

              // No existing draft — apply filters and decide.
              if (!passesFilters(pr, filters)) continue;

              if (filters?.skipOptioAuthored && (await isOptioAuthored(pr.url))) continue;

              // CI gate (only meaningful for on_pr_post)
              if (repo.externalReviewWaitForCi) {
                const checks = await platform.getCIChecks(ri, pr.headSha).catch(() => []);
                const status = determineCheckStatus(checks);
                if (status === "pending") {
                  // Park the PR in waiting_ci so the UI can reflect that
                  // Optio is watching but the agent hasn't started yet.
                  await db.insert(reviewDrafts).values({
                    prUrl: pr.url,
                    prNumber: pr.number,
                    repoOwner: ri.owner,
                    repoName: ri.repo,
                    headSha: pr.headSha,
                    state: "waiting_ci",
                    origin: "auto",
                    taskId: null,
                  });
                  continue;
                }
              }

              await launchPrReview({
                prUrl: pr.url,
                workspaceId: repo.workspaceId ?? undefined,
                origin: "auto",
              });
            } catch (err) {
              logger.warn(
                { err, prUrl: pr.url, repoId: repo.id },
                "external PR review: failed to process PR",
              );
            }
          }
        } catch (err) {
          logger.warn({ err, repoId: repo.id }, "external PR review: failed to process repo");
        }
      }
    }),
    { connection: connectionOpts, concurrency: 1 },
  );

  worker.on("failed", (_job, err) => {
    logger.error({ err }, "external-pr-review worker failed");
  });

  return worker;
}
