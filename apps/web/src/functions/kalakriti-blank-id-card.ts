import { db } from "@pi-dash/db";
import {
  kalakritiAttendee,
  kalakritiEdition,
  kalakritiEditionMembership,
  kalakritiStudent,
} from "@pi-dash/db/schema/kalakriti";
import { isKalakritiVolunteerManagementResponsibility } from "@pi-dash/shared/kalakriti";
import { parseKalakritiPersonQr } from "@pi-dash/shared/kalakriti-person-qr";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { z } from "zod";

import { resolveKalakritiEditionAccess } from "@/lib/server/kalakriti-edition-access";
import { authMiddleware } from "@/middleware/auth";

export const validateBlankIdCard = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.object({ editionId: z.uuid(), personQr: z.string().max(256) }))
  .handler(async ({ context, data }) => {
    if (!context.session) throw new Error("Unauthorized");
    const log = createRequestLogger();
    log.set({
      handler: "validateBlankIdCard",
      editionId: data.editionId,
      userId: context.session.user.id,
    });
    try {
      const [edition] = await db
        .select({ year: kalakritiEdition.year })
        .from(kalakritiEdition)
        .where(eq(kalakritiEdition.id, data.editionId))
        .limit(1);
      if (!edition) throw new Error("Edition not found");
      const access = await resolveKalakritiEditionAccess({
        year: edition.year,
        userId: context.session.user.id,
        role: context.session.user.role ?? "unoriented_volunteer",
      });
      if (
        !access ||
        !(
          access.isGlobalAdmin ||
          access.membership?.responsibilities.some((responsibility) =>
            responsibility === "edition_admin"
              ? true
              : isKalakritiVolunteerManagementResponsibility(responsibility)
          )
        )
      )
        throw new Error("Unauthorized");
      if (access.edition.lifecycle === "archived")
        throw new Error("Edition is archived");
      const person = parseKalakritiPersonQr(data.personQr);
      if (
        person.type !== "volunteer" &&
        person.type !== "guest" &&
        person.type !== "judge"
      )
        throw new Error("Scan a blank volunteer, guest, or judge card");
      const existing = await Promise.all([
        db
          .select({ id: kalakritiAttendee.id })
          .from(kalakritiAttendee)
          .where(eq(kalakritiAttendee.id, person.id))
          .limit(1),
        db
          .select({ id: kalakritiEditionMembership.id })
          .from(kalakritiEditionMembership)
          .where(eq(kalakritiEditionMembership.id, person.id))
          .limit(1),
        db
          .select({ id: kalakritiStudent.id })
          .from(kalakritiStudent)
          .where(eq(kalakritiStudent.id, person.id))
          .limit(1),
      ]);
      if (existing.some((rows) => rows.length > 0))
        throw new Error(
          "This ID card is already registered. Use the existing person's card."
        );
      return person;
    } catch (error) {
      log.error(error instanceof Error ? error : String(error));
      throw error;
    } finally {
      log.emit();
    }
  });
