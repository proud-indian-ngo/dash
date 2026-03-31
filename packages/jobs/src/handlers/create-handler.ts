import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

export function createNotifyHandler<T extends object>(
  queueName: string,
  getHandler: () => Promise<(data: T) => Promise<void>>
): (jobs: Job<T>[]) => Promise<void> {
  return async (jobs) => {
    const handler = await getHandler();
    for (const job of jobs) {
      const log = createRequestLogger({ method: "JOB", path: queueName });
      log.set({ ...job.data, jobId: job.id });
      try {
        await handler(job.data);
        log.set({ event: "job_complete" });
        log.emit();
      } catch (error) {
        log.set({ event: "job_failed" });
        log.error(error instanceof Error ? error : String(error));
        log.emit();
        throw error;
      }
    }
  };
}
