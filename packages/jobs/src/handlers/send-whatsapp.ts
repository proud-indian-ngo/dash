import { sendWhatsAppMessage } from "@pi-dash/whatsapp/messaging";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";

import type { WhatsAppPayload } from "../enqueue";

export async function handleSendWhatsApp(
  jobs: Job<WhatsAppPayload>[]
): Promise<void> {
  await Promise.all(
    jobs.map(async (job) => {
      const log = createRequestLogger({ method: "JOB", path: "send-whatsapp" });
      const { idempotencyKey, phone, message } = job.data;

      log.set({
        event: "job_start",
        jobId: job.id,
        phone,
      });

      await sendWhatsAppMessage(
        phone,
        message,
        idempotencyKey ? { idempotencyKey } : undefined
      );

      log.set({ event: "job_complete" });
      log.emit();
    })
  );
}
