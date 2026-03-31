import { createRequestLogger } from "evlog";
import type PgBoss from "pg-boss";
import type { WhatsAppPayload } from "../enqueue";

export async function handleSendWhatsApp(
  jobs: PgBoss.Job<WhatsAppPayload>[]
): Promise<void> {
  for (const job of jobs) {
    const log = createRequestLogger({ method: "JOB", path: "send-whatsapp" });
    const { phone, message } = job.data;

    log.set({
      event: "job_start",
      jobId: job.id,
      phone,
    });

    const { sendWhatsAppMessage } = await import("@pi-dash/whatsapp");

    await sendWhatsAppMessage(phone, message);

    log.set({ event: "job_complete" });
    log.emit();
  }
}
