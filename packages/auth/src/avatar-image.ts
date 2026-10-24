import {
  buildAvatarMediaUrl,
  parseAvatarMediaKey,
} from "@pi-dash/shared/media-url";
import { APIError } from "better-auth/api";

const VALIDATED_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Only the image finalizer can write this namespace; signers only write tmp. */
export function assertSuppliedAvatarImage(
  image: unknown,
  owner: { keyPrefix: string; userId?: string }
): void {
  if (image === undefined || image === null || image === "") {
    return;
  }
  const key =
    typeof image === "string" && owner.userId
      ? parseAvatarMediaKey(image, {
          userId: owner.userId,
          legacyCdnUrl: "https://unused.invalid",
        })
      : null;
  const prefix = `${owner.keyPrefix}/avatars/${owner.userId}/validated/`;
  if (
    !key ||
    !owner.userId ||
    !key.startsWith(prefix) ||
    !VALIDATED_ID.test(key.slice(prefix.length)) ||
    image !== buildAvatarMediaUrl(owner.userId, key)
  ) {
    throw new APIError("BAD_REQUEST", {
      message: "Upload and validate a profile picture before saving it",
    });
  }
}
