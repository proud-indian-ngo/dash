import { getAuth } from "@/functions/get-auth";

type AuthResult = NonNullable<Awaited<ReturnType<typeof getAuth>>>;

// 5 minutes — long enough to eliminate redundant calls from viewport
// preloading (~20 per navigation), short enough to pick up role changes
// within a reasonable window.
const CACHE_TTL = 5 * 60 * 1000;

let cached: AuthResult | null = null;
let lastFetchTime = 0;
let inflight: Promise<AuthResult | null> | null = null;

async function fetchAuth(): Promise<AuthResult | null> {
  const result = await getAuth();
  if (!result) {
    cached = null;
    lastFetchTime = 0;
    return null;
  }

  cached = result;
  lastFetchTime = Date.now();
  return result;
}

export async function getCachedAuth() {
  // Server route loaders share module state across requests. Caching an
  // authenticated result here would leak one user's session and permissions
  // into another user's request.
  if (typeof window === "undefined") {
    const result = await getAuth();
    return result
      ? { permissions: result.permissions, session: result.session }
      : { permissions: [] as string[], session: null };
  }

  if (cached && Date.now() - lastFetchTime < CACHE_TTL) {
    return { permissions: cached.permissions, session: cached.session };
  }

  // Dedup concurrent calls — all preload-triggered beforeLoad calls
  // share a single in-flight fetch instead of each firing independently.
  if (!inflight) {
    inflight = fetchAuth().finally(() => {
      inflight = null;
    });
  }

  const result = await inflight;
  if (!result) {
    return { permissions: [] as string[], session: null };
  }

  return { permissions: result.permissions, session: result.session };
}

export function invalidateAuthCache() {
  cached = null;
  lastFetchTime = 0;
  inflight = null;
}
