import { sendWhatsAppNotification } from "@pi-dash/whatsapp/notify";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

import type { WhatsAppPayload } from "../enqueue";

export async function handleSendWhatsApp(
  jobs: Job<WhatsAppPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({ method: "JOB", path: "send-whatsapp" });
      const { idempotencyKey, phone, message, template } = job.data;

      log.set({
        event: "job_start",
        jobId: job.id,
        phone,
        template: template?.name,
      });

      const outcome = await sendWhatsAppNotification(
        phone,
        { template, text: message },
        { idempotencyKey: idempotencyKey ?? `send-whatsapp-${job.id}` }
      );

      log.set({ event: "job_complete", outcome });
      log.emit();
    })
  );
}
