import { createHmac, timingSafeEqual } from "node:crypto";

/** Signed media links stay valid for 36 hours (the spec asks for at least 24). */
export const SOCIAL_MEDIA_URL_TTL_SECONDS = 36 * 60 * 60;

export const socialMediaVariants = ["original", "thumbnail"] as const;
export type SocialMediaVariant = (typeof socialMediaVariants)[number];

const SIG_RE = /^[0-9a-f]{64}$/;
const EXP_RE = /^\d{1,12}$/;

export function isSocialMediaVariant(
  value: string
): value is SocialMediaVariant {
  return (socialMediaVariants as readonly string[]).includes(value);
}

function signature(
  secret: string,
  photoId: string,
  variant: string,
  exp: number
): string {
  return createHmac("sha256", secret)
    .update(`${photoId}\n${variant}\n${exp}`)
    .digest("hex");
}

/** Token-free URL for one photo variant, valid until now + 36 hours. */
export function signSocialMediaUrl(options: {
  baseUrl: string;
  nowMs: number;
  photoId: string;
  secret: string;
  variant: SocialMediaVariant;
}): string {
  const exp = Math.floor(options.nowMs / 1000) + SOCIAL_MEDIA_URL_TTL_SECONDS;
  const url = new URL(
    `/api/social/v1/media/${encodeURIComponent(options.photoId)}/${options.variant}`,
    options.baseUrl
  );
  url.searchParams.set("exp", String(exp));
  url.searchParams.set(
    "sig",
    signature(options.secret, options.photoId, options.variant, exp)
  );
  return url.toString();
}

/** Constant-time check of a signed media URL's `exp` and `sig`. */
export function verifySocialMediaSignature(options: {
  exp: string | null;
  nowMs: number;
  photoId: string;
  secret: string;
  sig: string | null;
  variant: string;
}): boolean {
  const { exp, sig } = options;
  if (!(exp && sig && EXP_RE.test(exp) && SIG_RE.test(sig))) {
    return false;
  }
  const expSeconds = Number(exp);
  if (expSeconds * 1000 <= options.nowMs) {
    return false;
  }
  const expected = Buffer.from(
    signature(options.secret, options.photoId, options.variant, expSeconds),
    "hex"
  );
  return timingSafeEqual(expected, Buffer.from(sig, "hex"));
}
