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
  if (cached && Date.now() - lastFetchTime < CACHE_TTL) {
    return { session: cached.session, permissions: cached.permissions };
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
    return { session: null, permissions: [] as string[] };
  }

  return { session: result.session, permissions: result.permissions };
}

export function invalidateAuthCache() {
  cached = null;
  lastFetchTime = 0;
  inflight = null;
}
