import { getPlateImageUrls } from "@pi-dash/shared/media-url";
import { isPlateValue } from "@pi-dash/shared/plate-content";

export function assertFeedbackContentMediaPolicy(
  content: string,
  existingContent?: string
): void {
  const next = getPlateImageUrls(content);
  if (next.malformed || !isPlateValue(JSON.parse(content))) {
    throw new Error("Invalid feedback content");
  }
  const existing = existingContent
    ? getPlateImageUrls(existingContent)
    : { malformed: false, urls: [] };
  const allowedUrls = new Set(existing.malformed ? [] : existing.urls);
  if (next.urls.some((url) => !allowedUrls.has(url))) {
    throw new Error("Feedback cannot contain new images");
  }
}
