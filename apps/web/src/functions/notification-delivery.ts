import { db } from "@pi-dash/db";
import { createServerFn } from "@tanstack/react-start";
import z from "zod";

import { assertServerPermission } from "@/lib/api-auth";
import {
  EMAIL_STATUSES,
  INBOX_STATUSES,
  WHATSAPP_STATUSES,
} from "@/lib/notification-delivery";
import {
  type DeliveryOverview,
  type DeliveryPage,
  type DeliveryPreview,
  queryDeliveries,
  queryDeliveryOverview,
  queryDeliveryPreview,
} from "@/lib/server/notification-delivery";
import { authMiddleware } from "@/middleware/auth";

export type { DeliveryOverview, DeliveryPreview };

/** Message contents are personal, so the page has its own permission. */
const PERMISSION = "notifications.view_delivery";

const filterSchema = z.object({
  email: z.enum(EMAIL_STATUSES).optional(),
  inbox: z.enum(INBOX_STATUSES).optional(),
  key: z.string().optional(),
  limit: z.number().int().min(1).max(100),
  offset: z.number().int().min(0),
  search: z.string().max(120).optional(),
  topic: z.string().optional(),
  userId: z.string().optional(),
  whatsapp: z.enum(WHATSAPP_STATUSES).optional(),
});

/** A page of deliveries, filtered, paged and counted in Postgres. */
export const listNotificationDeliveries = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(filterSchema)
  .handler(async ({ context, data }): Promise<DeliveryPage> => {
    await assertServerPermission(context.session, PERMISSION);
    return await queryDeliveries(db, data);
  });

/** The last week's figures and everyone who received something in 90 days. */
export const getDeliveryOverview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<DeliveryOverview> => {
    await assertServerPermission(context.session, PERMISSION);
    return await queryDeliveryOverview(db);
  });

const previewSchema = z.object({
  key: z.string().min(1),
  userId: z.string().nullable(),
});

/** What the person saw: the inbox text and the WhatsApp message sent. */
export const getDeliveryPreview = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(previewSchema)
  .handler(async ({ context, data }): Promise<DeliveryPreview> => {
    await assertServerPermission(context.session, PERMISSION);
    return await queryDeliveryPreview(db, data);
  });
