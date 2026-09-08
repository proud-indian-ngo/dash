import { createRequestLogger } from "evlog";
import { PgBoss } from "pg-boss";

import { getBossInstance, setBossInstance } from "./boss-instance";

/** CLI queue access without starting handlers, schedules, or schema migrations. */
export async function startJobProducer(databaseUrl: string) {
  if (getBossInstance()) {
    throw new Error("A job producer or worker is already running");
  }
  const boss = new PgBoss({
    application_name: "pi-dash-job-producer",
    connectionString: databaseUrl,
    max: 1,
    migrate: false,
    schedule: false,
    schema: "pgboss",
    supervise: false,
  });
  boss.on("error", (error: Error) => {
    const log = createRequestLogger({ path: "jobs/producer" });
    log.set({ handler: "jobProducer" });
    log.error(error);
    log.emit();
  });
  await boss.start();
  setBossInstance(boss);
  return {
    createQueue: (name: string) => boss.createQueue(name),
    stop: async () => {
      await boss.stop({ graceful: true });
      setBossInstance(undefined);
    },
  };
}
