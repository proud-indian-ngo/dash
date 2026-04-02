import { startWorker, stopWorker } from "@pi-dash/jobs/boss";
import { createRequestLogger } from "evlog";
import { definePlugin } from "nitro";

export default definePlugin(async () => {
  try {
    await startWorker();
  } catch (error) {
    const log = createRequestLogger({ method: "SYSTEM", path: "plugin/jobs" });
    log.error(error instanceof Error ? error : String(error));
  }

  const shutdownHandler = async () => {
    await stopWorker();
  };
  process.on("SIGTERM", shutdownHandler);
  process.on("SIGINT", shutdownHandler);
});
