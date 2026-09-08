import {
  backfillKalakritiOrientation,
  parseBackfillTarget,
} from "@pi-dash/db/kalakriti-orientation-backfill";
import { startJobProducer } from "@pi-dash/jobs/producer";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { createRequestLogger } from "evlog";

async function main() {
  const log = createRequestLogger({ path: "backfill-kalakriti-orientation" });
  log.set({ handler: "backfillKalakritiOrientation" });
  let client: SQL | undefined;
  let producer: Awaited<ReturnType<typeof startJobProducer>> | undefined;
  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required");
    }
    const options = parseBackfillTarget(databaseUrl, process.argv.slice(2));
    log.set({
      apply: options.apply,
      local: options.local,
      target: options.target,
    });
    if (options.apply) {
      // Fail before role writes if the queue isn't available in this same DB.
      producer = await startJobProducer(databaseUrl);
      await producer.createQueue("whatsapp-manage-orientation");
      await producer.createQueue("notify-role-changed");
    }
    client = new SQL(databaseUrl, { max: 1, connectionTimeout: 5 });
    const result = await backfillKalakritiOrientation(drizzle({ client }), {
      apply: options.apply,
      now: Date.now(),
    });
    log.set({
      candidates: result.candidates,
      promoted: result.promotedUserIds.length,
    });
    process.stdout.write(
      `${JSON.stringify({ mode: options.apply ? "apply" : "dry-run", target: options.target, candidates: result.candidates, promoted: result.promotedUserIds.length })}\n`
    );

    if (result.promotedUserIds.length > 0) {
      const { enqueue } = await import("@pi-dash/jobs/enqueue");
      // The CLI awaits delivery to the queue before exiting, never the handlers.
      for (const userId of result.promotedUserIds) {
        await enqueue("whatsapp-manage-orientation", {
          isOriented: true,
          userId,
        });
        await enqueue("notify-role-changed", { newRole: "Volunteer", userId });
      }
      process.stdout.write(
        `Queued orientation and role-change jobs for ${result.promotedUserIds.length} users.\n`
      );
    }
  } catch (error) {
    log.error(error instanceof Error ? error : String(error));
    throw error;
  } finally {
    log.emit();
    await client?.close();
    await producer?.stop();
  }
}

if (import.meta.main) {
  main().then(
    () => process.exit(0),
    () => process.exit(1)
  );
}
