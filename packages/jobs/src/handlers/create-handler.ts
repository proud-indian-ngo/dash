import { captureSends } from "@pi-dash/notifications/send-message";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

type HandlerOutput = Record<string, unknown>;

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
      log.set({ ...job.data, jobId: job.id });
      const startedAt = Date.now();
      try {
        const { result, sends } = await captureSends(() => handler(job.data));
        log.set({ event: "job_complete" });
        log.emit();
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
        outputs.push(output);
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
