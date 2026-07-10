import { isAssetId } from "@pi-dash/shared/asset-ref";
import {
  ALLOWED_APPROVAL_SCREENSHOT_TYPES,
  ALLOWED_EVENT_MEDIA_TYPES,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_MIME_TYPES,
  MAX_APPROVAL_SCREENSHOT_SIZE_BYTES,
  MAX_ATTACHMENT_FILE_SIZE_BYTES,
  MAX_AVATAR_IMAGE_SIZE_BYTES,
  MAX_IMAGE_SIZE_BYTES,
  MAX_VIDEO_SIZE_BYTES,
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

const protectedUploadFields = {
  fileName: z.string().trim().min(1),
  fileSize: z.number().int().positive(),
  mimeType: z.enum(ALLOWED_MIME_TYPES),
};

const protectedUploadSchema = z
  .object(protectedUploadFields)
  .superRefine((data, ctx) => {
    const maxBytes = data.mimeType.startsWith("video/")
      ? MAX_VIDEO_SIZE_BYTES
      : MAX_ATTACHMENT_FILE_SIZE_BYTES;
    if (data.fileSize > maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `File exceeds ${maxBytes / 1024 / 1024} MB limit`,
        path: ["fileSize"],
      });
    }
  });

export const requestUploadSchema = protectedUploadSchema;
export const scheduledMessageUploadSchema = protectedUploadSchema;

export const approvalScreenshotUploadSchema = z.object({
  fileName: z.string().trim().min(1),
  fileSize: z.number().int().positive().max(MAX_APPROVAL_SCREENSHOT_SIZE_BYTES),
  mimeType: z.enum(ALLOWED_APPROVAL_SCREENSHOT_TYPES),
});

export const eventPhotoUploadSchema = z
  .object({
    eventId: z.string().refine(isAssetId, "Invalid event ID"),
    fileName: z.string().trim().min(1),
    fileSize: z.number().int().positive(),
    mimeType: z.enum(ALLOWED_EVENT_MEDIA_TYPES),
  })
  .superRefine((data, ctx) => {
    const maxBytes = data.mimeType.startsWith("video/")
      ? MAX_VIDEO_SIZE_BYTES
      : MAX_IMAGE_SIZE_BYTES;
    if (data.fileSize > maxBytes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `File exceeds ${maxBytes / 1024 / 1024} MB limit`,
        path: ["fileSize"],
      });
    }
  });
