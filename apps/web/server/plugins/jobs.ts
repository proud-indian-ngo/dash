import { startWorker, stopWorker } from "@pi-dash/jobs/boss";
import { getBossInstance, getReadyPromise } from "@pi-dash/jobs/boss-instance";
import { createRequestLogger } from "evlog";
import { definePlugin } from "nitro";

import { registerEsignWorker } from "../../src/lib/governance/esign-worker";
import { registerRazorpayWorker } from "../../src/lib/razorpay/worker";

export default definePlugin(async () => {
  try {
    await startWorker();
    // A reloaded plugin finds the worker already starting; wait for its queues.
    await getReadyPromise();
    const boss = getBossInstance();
    if (boss) {
      // Runs the contribution import rules, which live in the web app.
      await registerRazorpayWorker(boss);
      // Holds the Leegality and signing clients, which live in the web app.
      await registerEsignWorker(boss);
    }
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
