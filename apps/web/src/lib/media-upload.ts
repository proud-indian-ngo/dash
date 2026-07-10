import { isAssetId } from "@pi-dash/shared/asset-ref";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_AVATAR_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import z from "zod";

const imageUploadFields = {
  fileName: z.string().trim().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.enum(ALLOWED_IMAGE_TYPES),
};

export const avatarUploadSchema = z.object({
  ...imageUploadFields,
  fileSize: imageUploadFields.fileSize.max(MAX_AVATAR_IMAGE_SIZE_BYTES),
});

export const eventEditorUploadSchema = z.object({
  ...imageUploadFields,
  eventId: z.string().refine(isAssetId, "Invalid event ID"),
  fileSize: imageUploadFields.fileSize.max(MAX_IMAGE_SIZE_BYTES),
});
