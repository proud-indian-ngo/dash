import { db } from "@pi-dash/db";
import { whatsappGroup } from "@pi-dash/db/schema/whatsapp-group";
import { uuidv7 } from "uuidv7";

import { log } from "./core";

const TEST_WHATSAPP_GROUP = {
  jid: "e2e-test-group@g.us",
  name: "E2E Test Group",
};

export async function ensureWhatsAppGroup(): Promise<void> {
  const existing = await db.query.whatsappGroup.findFirst({
    where: (table, ops) => ops.eq(table.jid, TEST_WHATSAPP_GROUP.jid),
  });
  if (!existing) {
    const now = new Date();
    await db.insert(whatsappGroup).values({
      createdAt: now,
      id: uuidv7(),
      jid: TEST_WHATSAPP_GROUP.jid,
      name: TEST_WHATSAPP_GROUP.name,
      updatedAt: now,
    });
    log(`Created WhatsApp group: ${TEST_WHATSAPP_GROUP.name}`);
  }
}
