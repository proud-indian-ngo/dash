import { captureSends } from "@pi-dash/notifications/send-message";
import { runWithTraceId } from "@pi-dash/observability/trace-store";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

type HandlerOutput = Record<string, unknown>;

function extractTraceId<T extends object>(
  data: T
): { traceId: string | undefined; cleanData: T } {
  const { __traceId: traceId, ...rest } = data as T & {
    __traceId?: string;
  };
  return { traceId, cleanData: rest as T };
}

function buildOutput(
  startedAt: number,
  result: unknown,
  sends: unknown[]
): HandlerOutput {
  const output: HandlerOutput = {
    ok: true,
    durationMs: Date.now() - startedAt,
  };
  if (sends.length > 0) {
    output.sends = sends;
  }
  if (result && typeof result === "object") {
    output.result = result;
  }
  return output;
}

export function withDefaultOutput<T extends object>(
  handler: (jobs: Job<T>[]) => Promise<unknown>
): (jobs: Job<T>[]) => Promise<HandlerOutput> {
  return async (jobs) => {
    const startedAt = Date.now();
    const { result, sends } = await captureSends(() => handler(jobs));
    const base: HandlerOutput = {
      jobCount: jobs.length,
      durationMs: Date.now() - startedAt,
    };
    if (sends.length > 0) {
      base.sends = sends;
    }
    if (result && typeof result === "object") {
      return { ...base, result };
    }
    return { ok: true, ...base };
  };
}

// Batch handlers (batchSize > 1) return `{ batch: [...] }`. pg-boss stores the
// same return value as output for every job in the batch, so each job sees the
// full batch summary rather than its own slice.
export function createNotifyHandler<T extends object, R = void>(
  queueName: string,
  getHandler: () => Promise<(data: T) => Promise<R>>
): (jobs: Job<T>[]) => Promise<HandlerOutput> {
  return async (jobs) => {
    const handler = await getHandler();
    const outputs: HandlerOutput[] = [];
    for (const job of jobs) {
      const log = createRequestLogger({ method: "JOB", path: queueName });
      const { traceId, cleanData } = extractTraceId(job.data);
      log.set({
        ...cleanData,
        jobId: job.id,
        ...(traceId ? { traceId } : {}),
      });
      const startedAt = Date.now();
      try {
        const run = () => captureSends(() => handler(cleanData));
        const { result, sends } = traceId
          ? await runWithTraceId(traceId, run)
          : await run();
        log.set({ event: "job_complete" });
        log.emit();
        outputs.push(buildOutput(startedAt, result, sends));
      } catch (error) {
        log.set({ event: "job_failed" });
        log.error(error instanceof Error ? error : String(error));
        log.emit();
        throw error;
      }
    }
    const first = outputs[0];
    return outputs.length === 1 && first ? first : { batch: outputs };
  };
}
