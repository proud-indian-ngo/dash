import { createHash } from "node:crypto";

import { Avatar, Style, type StyleOptions } from "@dicebear/core";
import notionists from "@dicebear/styles/notionists.json";
import { db } from "@pi-dash/db";
import { env } from "@pi-dash/env/server";
import { createFileRoute } from "@tanstack/react-router";
import { createRequestLogger } from "evlog";

import { requireSession } from "@/lib/api-auth";

type NotionistsOptions = StyleOptions<typeof notionists>;

const NOTIONISTS = new Style(notionists);

const TRAILING_SLASHES_REGEX = /\/+$/;
const AVATAR_CACHE_CONTROL = "private, max-age=300";
// The ranges are within each component's variants, so the narrowing cast holds.
const createVariantRange = <T extends string>(
  start: number,
  end: number
): T[] =>
  Array.from(
    { length: end - start + 1 },
    (_, index) => `variant${(start + index).toString().padStart(2, "0")}` as T
  );

const UNISEX_GLASSES_OPTIONS = createVariantRange<
  Extract<NotionistsOptions["glassesVariant"], string>
>(1, 11);
const GENDER_AVATAR_OPTIONS: Record<"female" | "male", NotionistsOptions> = {
  male: {
    hairVariant: createVariantRange(1, 20),
    beardProbability: 70,
    beardVariant: createVariantRange(1, 12),
    clothesVariant: createVariantRange(1, 10),
    glassesProbability: 20,
    glassesVariant: UNISEX_GLASSES_OPTIONS,
    gestureProbability: 20,
    gestureVariant: ["hand", "ok", "point", "pointLongArm"],
  },
  female: {
    hairVariant: createVariantRange(30, 63),
    beardProbability: 0,
    clothesVariant: createVariantRange(11, 25),
    mouthVariant: createVariantRange(10, 20),
    glassesProbability: 20,
    glassesVariant: UNISEX_GLASSES_OPTIONS,
    gestureProbability: 20,
    gestureVariant: [
      "hand",
      "handPhone",
      "ok",
      "waveLongArm",
      "waveLongArms",
      "waveOkLongArms",
      "wavePointLongArms",
    ],
  },
};

const toObject = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Record<string, unknown>;
};

const toHttpUrl = (value: unknown): string | undefined => {
  if (typeof value !== "string" || value.trim() === "") {
    return;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return;
    }
    return parsed.toString();
  } catch {
    const fallback = undefined;
    return fallback;
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
};

const hashSha256 = (value: string): string =>
  createHash("sha256").update(value).digest("hex");

const extractAvatarUrl = (payload: unknown): string | undefined => {
  const data = toObject(payload);
  if (!data) {
    return;
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
};

// Rendered in-process: proxying api.dicebear.com from one server IP hits its
// PNG rate limit (429) whenever a page lists many members.
const renderFallbackAvatar = (
  normalizedEmail: string,
  gender?: "female" | "male"
): string =>
  new Avatar(NOTIONISTS, {
    seed: hashSha256(`${env.AVATAR_FALLBACK_SEED}:${normalizedEmail}`),
    ...(gender ? GENDER_AVATAR_OPTIONS[gender] : {}),
  }).toString();

const buildProfileEndpointUrl = (profileIdentifier: string): string => {
  const baseUrl = env.GRAVATAR_API_BASE_URL.replace(TRAILING_SLASHES_REGEX, "");
  return `${baseUrl}/profiles/${profileIdentifier}`;
};

const fetchProfileAvatarUrl = async (
  profileIdentifier: string
): Promise<string | undefined> => {
  if (!(env.GRAVATAR_API_BASE_URL && env.GRAVATAR_API_KEY)) {
    return;
  }

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
      return;
    }

    const payload = (await response.json()) as unknown;
    return extractAvatarUrl(payload);
  } catch (caughtError) {
    const log = createRequestLogger({ method: "GET", path: "/api/avatar" });
    log.set({ profileIdentifier });
    log.error(caughtError instanceof Error ? caughtError : String(caughtError));
    log.emit();
  } finally {
    clearTimeout(timeoutHandle);
  }
};

interface AvatarUser {
  email: string;
  gender: null | string;
}

interface AvatarSession {
  user: { id: string };
}

export interface AvatarHandlerDeps {
  fetchImage: (url: URL, options: RequestInit) => Promise<Response>;
  findUser: (userId: string) => Promise<AvatarUser | undefined>;
  requireSession: (
    request: Request
  ) => Promise<{ session: AvatarSession } | { error: Response }>;
  resolveGravatarUrl: (normalizedEmail: string) => Promise<string | undefined>;
}

const defaultHandlerDeps: AvatarHandlerDeps = {
  fetchImage: (url, options) => fetch(url, options),
  findUser: (userId) =>
    db.query.user.findFirst({
      columns: { email: true, gender: true },
      where: (table, { eq }) => eq(table.id, userId),
    }),
  requireSession,
  resolveGravatarUrl: (normalizedEmail) =>
    fetchProfileAvatarUrl(hashSha256(normalizedEmail)),
};

export async function handleAvatarRequest(
  request: Request,
  deps = defaultHandlerDeps
): Promise<Response> {
  const authResult = await deps.requireSession(request);
  if ("error" in authResult) {
    return authResult.error;
  }

  const userId = new URL(request.url).searchParams.get("userId")?.trim();
  if (!userId || userId.length > 128) {
    return Response.json({ error: "Missing userId" }, { status: 400 });
  }

  const avatarUser = await deps.findUser(userId);
  if (!avatarUser) {
    return Response.json({ error: "Avatar not found" }, { status: 404 });
  }
  try {
    const normalizedEmail = normalizeEmail(avatarUser.email);
    if (!normalizedEmail) {
      throw new Error("Avatar user has no email");
    }
    const gravatarUrl = await deps.resolveGravatarUrl(normalizedEmail);
    if (!gravatarUrl) {
      const svg = renderFallbackAvatar(
        normalizedEmail,
        normalizeGender(avatarUser.gender)
      );
      return new Response(svg, {
        headers: {
          "Cache-Control": AVATAR_CACHE_CONTROL,
          "Content-Security-Policy": "default-src 'none'; sandbox",
          "Content-Type": "image/svg+xml",
          Vary: "Cookie",
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    const avatarUrl = new URL(gravatarUrl);
    if (
      avatarUrl.protocol !== "https:" ||
      avatarUrl.username ||
      avatarUrl.password ||
      avatarUrl.port ||
      !(
        avatarUrl.hostname === "gravatar.com" ||
        avatarUrl.hostname.endsWith(".gravatar.com")
      ) ||
      !avatarUrl.pathname.startsWith("/avatar/")
    ) {
      throw new Error("Unsupported avatar image URL");
    }

    const upstream = await deps.fetchImage(avatarUrl, {
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]),
    });
    const contentType = upstream.headers
      .get("content-type")
      ?.split(";")[0]
      ?.trim()
      .toLowerCase();
    if (
      !upstream.ok ||
      !upstream.body ||
      !contentType ||
      ![
        "image/png",
        "image/jpeg",
        "image/webp",
        "image/gif",
        "image/avif",
      ].includes(contentType)
    ) {
      await upstream.body?.cancel();
      throw new Error(
        `Invalid avatar image response: ${upstream.status} ${contentType}`
      );
    }

    return new Response(upstream.body, {
      headers: {
        "Cache-Control": AVATAR_CACHE_CONTROL,
        "Content-Type": contentType,
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const log = createRequestLogger({ method: "GET", path: "/api/avatar" });
    log.set({ avatarUserId: userId, userId: authResult.session.user.id });
    log.error(error instanceof Error ? error : String(error));
    log.emit();
    return Response.json({ error: "Failed to fetch avatar" }, { status: 502 });
  }
}

export const Route = createFileRoute("/api/avatar")({
  server: {
    handlers: {
      GET: async ({ request }) => handleAvatarRequest(request),
    },
  },
});
