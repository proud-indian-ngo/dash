import { createHash } from "node:crypto";
import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";
import { requireSession } from "@/lib/api-auth";

const TRAILING_SLASHES_REGEX = /\/+$/;
const AVATAR_CACHE_CONTROL = "private, max-age=31536000, immutable";
const toVariant = (value: number): string =>
  `variant${value.toString().padStart(2, "0")}`;
const createVariantRange = (start: number, end: number): string[] =>
  Array.from({ length: end - start + 1 }, (_, index) =>
    toVariant(start + index)
  );

const MALE_HAIR_OPTIONS = createVariantRange(1, 20);
const MALE_BEARD_OPTIONS = createVariantRange(1, 12);
const MALE_BODY_OPTIONS = createVariantRange(1, 10);
const UNISEX_GLASSES_OPTIONS = createVariantRange(1, 11);
const MALE_GESTURE_OPTIONS = ["hand", "ok", "point", "pointLongArm"] as const;
const FEMALE_HAIR_OPTIONS = createVariantRange(30, 63);
const FEMALE_BODY_OPTIONS = createVariantRange(11, 25);
const FEMALE_LIPS_OPTIONS = createVariantRange(10, 20);
const FEMALE_GESTURE_OPTIONS = [
  "hand",
  "handPhone",
  "ok",
  "waveLongArm",
  "waveLongArms",
  "waveOkLongArms",
  "wavePointLongArms",
] as const;

const toObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
};

const toHttpUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return undefined;
    }
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const normalizeEmail = (email: null | string): string | undefined => {
  const normalizedEmail = email?.trim().toLowerCase();
  return normalizedEmail ? normalizedEmail : undefined;
};

const normalizeGender = (
  gender: null | string
): "female" | "male" | undefined => {
  const normalizedGender = gender?.trim().toLowerCase();
  if (normalizedGender === "male" || normalizedGender === "female") {
    return normalizedGender;
  }

  return undefined;
};

const hashSha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const extractAvatarUrl = (payload: unknown): string | undefined => {
  const data = toObject(payload);
  if (!data) {
    return undefined;
  }

  const directCandidates = [
    data.avatar_url,
    data.avatarUrl,
    data.avatar,
    data.profile_avatar_url,
    data.profileAvatarUrl,
  ];

  for (const candidate of directCandidates) {
    const directUrl = toHttpUrl(candidate);
    if (directUrl) {
      return directUrl;
    }

    const nested = toObject(candidate);
    if (!nested) {
      continue;
    }

    const nestedCandidates = [nested.url, nested.src, nested.href];
    for (const nestedCandidate of nestedCandidates) {
      const nestedUrl = toHttpUrl(nestedCandidate);
      if (nestedUrl) {
        return nestedUrl;
      }
    }
  }

  return undefined;
};

const buildFallbackAvatarUrl = (
  normalizedEmail: string,
  gender?: "female" | "male"
): string => {
  const fallbackSeed = hashSha256(
    `${env.AVATAR_FALLBACK_SEED}:${normalizedEmail}`
  );
  const url = new URL("https://api.dicebear.com/9.x/notionists/png");
  url.searchParams.set("seed", fallbackSeed);

  if (gender === "male") {
    url.searchParams.set("hair", MALE_HAIR_OPTIONS.join(","));
    url.searchParams.set("beardProbability", "70");
    url.searchParams.set("beard", MALE_BEARD_OPTIONS.join(","));
    url.searchParams.set("body", MALE_BODY_OPTIONS.join(","));
    url.searchParams.set("glassesProbability", "20");
    url.searchParams.set("glasses", UNISEX_GLASSES_OPTIONS.join(","));
    url.searchParams.set("gestureProbability", "20");
    url.searchParams.set("gesture", MALE_GESTURE_OPTIONS.join(","));
  }

  if (gender === "female") {
    url.searchParams.set("hair", FEMALE_HAIR_OPTIONS.join(","));
    url.searchParams.set("beardProbability", "0");
    url.searchParams.set("body", FEMALE_BODY_OPTIONS.join(","));
    url.searchParams.set("lips", FEMALE_LIPS_OPTIONS.join(","));
    url.searchParams.set("glassesProbability", "20");
    url.searchParams.set("glasses", UNISEX_GLASSES_OPTIONS.join(","));
    url.searchParams.set("gestureProbability", "20");
    url.searchParams.set("gesture", FEMALE_GESTURE_OPTIONS.join(","));
  }

  return url.toString();
};

const buildProfileEndpointUrl = (profileIdentifier: string): string => {
  const baseUrl = env.GRAVATAR_API_BASE_URL.replace(TRAILING_SLASHES_REGEX, "");
  return `${baseUrl}/profiles/${profileIdentifier}`;
};

const fetchProfileAvatarUrl = async (
  profileIdentifier: string
): Promise<string | undefined> => {
  const controller = new AbortController();
  const timeoutHandle = setTimeout(
    () => controller.abort(),
    env.GRAVATAR_TIMEOUT_MS
  );

  try {
    const response = await fetch(buildProfileEndpointUrl(profileIdentifier), {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${env.GRAVATAR_API_KEY}`,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      return undefined;
    }

    const payload = (await response.json()) as unknown;
    return extractAvatarUrl(payload);
  } catch (error) {
    const log = createRequestLogger({ method: "GET", path: "/api/avatar" });
    log.set({ profileIdentifier });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return undefined;
  } finally {
    clearTimeout(timeoutHandle);
  }
};

export const Route = createFileRoute("/api/avatar")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { error } = await requireSession(request);
        if (error) {
          return error;
        }

        const requestUrl = new URL(request.url);
        const normalizedEmail = normalizeEmail(
          requestUrl.searchParams.get("email")
        );
        const normalizedGender = normalizeGender(
          requestUrl.searchParams.get("gender")
        );

        if (!normalizedEmail) {
          return Response.json({ error: "Missing email" }, { status: 400 });
        }

        const profileIdentifier = hashSha256(normalizedEmail);
        const avatarUrl =
          (await fetchProfileAvatarUrl(profileIdentifier)) ??
          buildFallbackAvatarUrl(normalizedEmail, normalizedGender);

        return new Response(null, {
          status: 302,
          headers: {
            "Cache-Control": AVATAR_CACHE_CONTROL,
            Location: avatarUrl,
            Vary: "Cookie",
          },
        });
      },
    },
  },
});
