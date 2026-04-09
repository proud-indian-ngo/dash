import { db } from "@pi-dash/db";
import { resolvePermissions } from "@pi-dash/db/queries/resolve-permissions";
import { teamEvent } from "@pi-dash/db/schema/team-event";
import {
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { createServerFn } from "@tanstack/react-start";
import { format, parseISO } from "date-fns";
import { eq } from "drizzle-orm";
import { createRequestLogger } from "evlog";
import { uuidv7 } from "uuidv7";
import {
  addAssetToAlbum,
  ensureImmichAlbum,
  getImmichConfig,
  uploadAssetToImmich,
} from "@/lib/immich";
import { authMiddleware } from "@/middleware/auth";

const MEDIA_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
]);
const OCC_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VIDEO_MIME_TYPES = new Set(["video/mp4", "video/quicktime"]);

function buildImmichAlbumName(
  event: {
    name: string;
    recurrenceRule: { rrule: string; exdates?: string[] } | null;
    seriesId: string | null;
    originalDate: string | null;
    startTime: Date;
  },
  occDate?: string
) {
  const isRecurring = !!event.recurrenceRule || !!event.seriesId;
  if (!isRecurring) {
    return event.name;
  }

  let eventDate = new Date(event.startTime);
  if (event.originalDate) {
    eventDate = parseISO(event.originalDate);
  }
  if (occDate) {
    eventDate = parseISO(occDate);
  }

  return `${event.name} - ${format(eventDate, "MMMM d, yyyy")}`;
}

export const uploadPhotoToImmich = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator((input: unknown) => {
    if (!(input instanceof FormData)) {
      throw new Error("Expected FormData");
    }
    const file = input.get("file");
    const eventId = input.get("eventId");
    const occDate = input.get("occDate");
    const mimeType = input.get("mimeType");
    const fileSize = input.get("fileSize");
    if (!(file instanceof Blob) || typeof eventId !== "string") {
      throw new Error("Missing file or eventId");
    }
    const mime = typeof mimeType === "string" ? mimeType : file.type;
    const size = typeof fileSize === "string" ? Number(fileSize) : file.size;
    if (typeof occDate === "string" && !OCC_DATE_RE.test(occDate)) {
      throw new Error("Invalid occurrence date");
    }
    if (!MEDIA_MIME_TYPES.has(mime)) {
      throw new Error("Unsupported file type");
    }
    const maxSize = VIDEO_MIME_TYPES.has(mime)
      ? MAX_VIDEO_SIZE_BYTES
      : MAX_IMAGE_SIZE_BYTES;
    if (size > maxSize) {
      const limit = VIDEO_MIME_TYPES.has(mime) ? "100 MB" : "20 MB";
      throw new Error(`File exceeds ${limit} limit`);
    }
    return {
      file,
      eventId,
      mimeType: mime,
      occDate: typeof occDate === "string" ? occDate : undefined,
    };
  })
  .handler(async ({ context, data }) => {
    const log = createRequestLogger({
      method: "POST",
      path: "/fn/immich-upload",
    });

    const session = context.session;
    if (!session) {
      return { error: "Unauthorized" } as const;
    }

    const { file, eventId, occDate } = data;
    log.set({
      userId: session.user.id,
      role: session.user.role,
      eventId,
      occDate,
      fileName: file.name,
      fileSize: file.size,
    });

    // Verify Immich is configured
    const config = await getImmichConfig();
    if (!config) {
      return { error: "Immich not configured" } as const;
    }

    // Look up event
    const event = await db.query.teamEvent.findFirst({
      where: eq(teamEvent.id, eventId),
    });
    if (!event) {
      return { error: "Event not found" } as const;
    }

    log.set({ teamId: event.teamId, eventName: event.name });

    // Verify user has manage_photos permission or is team lead
    const role = session.user.role ?? "unoriented_volunteer";
    const permissions = await resolvePermissions(role);
    let canUpload = permissions.includes("events.manage_photos");
    if (!canUpload) {
      const membership = await db.query.teamMember.findFirst({
        where: (t, { and, eq: e }) =>
          and(
            e(t.teamId, event.teamId),
            e(t.userId, session.user.id),
            e(t.role, "lead")
          ),
      });
      canUpload = !!membership;
    }

    if (!canUpload) {
      return {
        error:
          "Only users with photo management permission or team leads can upload directly to Immich",
      } as const;
    }

    try {
      const albumId = await ensureImmichAlbum(
        config,
        eventId,
        buildImmichAlbumName(event, occDate)
      );
      log.set({ albumId });

      const deviceAssetId = `pi-dash-direct-${uuidv7()}`;
      const assetId = await uploadAssetToImmich(
        config,
        file,
        file.name,
        deviceAssetId
      );
      log.set({ immichAssetId: assetId });

      await addAssetToAlbum(config, albumId, assetId);

      log.emit();
      return { immichAssetId: assetId } as const;
    } catch (err) {
      log.error(err instanceof Error ? err : String(err), {
        step: "immich-upload",
      });
      log.emit();
      return { error: "Upload to Immich failed" } as const;
    }
  });
