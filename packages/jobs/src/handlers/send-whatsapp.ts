import { sendWhatsAppMessage } from "@pi-dash/whatsapp";
import { createRequestLogger } from "evlog";
import type { Job } from "pg-boss";
import type { WhatsAppPayload } from "../enqueue";

export async function handleSendWhatsApp(
  jobs: Job<WhatsAppPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({ method: "JOB", path: "send-whatsapp" });
    const { phone, message } = job.data;

    log.set({
      event: "job_start",
      jobId: job.id,
      phone,
    });

    await sendWhatsAppMessage(phone, message);

    log.set({ event: "job_complete" });
    log.emit();
  }
}
