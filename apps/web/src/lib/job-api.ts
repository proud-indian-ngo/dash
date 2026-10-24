/** The explicit inspection boundary shared by the job list and detail APIs. */
export type JobInspection = {
  completedOn: string | null;
  createdOn: string;
  data?: object;
  id: string;
  name: string;
  output?: object | null;
  priority: number;
  retryCount: number;
  retryLimit: number;
  startAfter: string;
  startedOn: string | null;
  state: string;
};

export function serializeJob(
  job: JobInspection,
  role: string | null | undefined
): JobInspection {
  return {
    completedOn: job.completedOn,
    createdOn: job.createdOn,
    id: job.id,
    name: job.name,
    priority: job.priority,
    retryCount: job.retryCount,
    retryLimit: job.retryLimit,
    startAfter: job.startAfter,
    startedOn: job.startedOn,
    state: job.state,
    ...(role === "super_admin" ? { data: job.data, output: job.output } : {}),
  };
}
