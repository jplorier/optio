import { Queue } from "bullmq";
import { runKey } from "@optio/shared";
import type { RunRef } from "@optio/shared";
import { getBullMQConnectionOptions } from "./redis-config.js";
import { logger } from "../logger.js";

const connectionOpts = getBullMQConnectionOptions();

export const RECONCILE_QUEUE_NAME = "reconcile";

export const reconcileQueue = new Queue(RECONCILE_QUEUE_NAME, {
  connection: connectionOpts,
});

export interface EnqueueOptions {
  /** Reason string for telemetry. Not used for dedup. */
  reason: string;
  /** Optional delay before the reconcile tick runs. */
  delayMs?: number;
}

/**
 * Enqueue a reconcile pass for the given run. Jobs are deduplicated by
 * `${kind}:${id}` via BullMQ's jobId — a second enqueue while one is already
 * queued/delayed collapses into a single execution. A currently-running job
 * does not dedupe (BullMQ allows a new job with the same id once the active
 * one completes).
 */
export async function enqueueReconcile(ref: RunRef, opts: EnqueueOptions): Promise<void> {
  const jobId = runKey(ref);
  try {
    await reconcileQueue.add(
      "reconcile",
      { ref, reason: opts.reason },
      {
        jobId: opts.delayMs ? `${jobId}__${Date.now()}` : jobId,
        delay: opts.delayMs,
        removeOnComplete: 1000,
        removeOnFail: 500,
      },
    );
  } catch (err) {
    logger.warn({ err, ref, reason: opts.reason }, "enqueueReconcile failed");
  }
}
