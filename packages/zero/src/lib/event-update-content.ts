import { getPlateImageUrls } from "@pi-dash/shared/media-url";

interface EventUpdateContentMediaPolicy {
  allowNewImages: boolean;
  existingContent?: string;
}

export function assertEventUpdateContentMediaPolicy(
  content: string,
  policy: EventUpdateContentMediaPolicy
): void {
  if (policy.allowNewImages) {
    return;
  }
  const next = getPlateImageUrls(content);
  if (next.malformed) {
    if (policy.existingContent === content) {
      return;
    }
    throw new Error("Update cannot contain new images");
  }
  const existing = policy.existingContent
    ? getPlateImageUrls(policy.existingContent)
    : { malformed: false, urls: [] };
  const allowedUrls = new Set(existing.malformed ? [] : existing.urls);
  if (next.urls.some((url) => !allowedUrls.has(url))) {
    throw new Error("Update cannot contain new images");
  }
}
