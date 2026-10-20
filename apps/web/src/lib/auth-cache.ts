import { getAuth } from "@/functions/get-auth";
import { invalidateAdminUsersCache } from "@/lib/admin-users-cache";
import { clearPendingKalakritiAccessRequests } from "@/lib/kalakriti-access-request";

type AuthResult = NonNullable<Awaited<ReturnType<typeof getAuth>>>;

// 5 minutes — long enough to eliminate redundant calls from viewport
// preloading (~20 per navigation), short enough to pick up role changes
// within a reasonable window.
const CACHE_TTL = 5 * 60 * 1000;

let cached: AuthResult | null = null;
let lastFetchTime = 0;
let inflight: Promise<AuthResult | null> | null = null;
let cacheGeneration = 0;

async function fetchAuth(
  requestGeneration: number
): Promise<AuthResult | null> {
  const result = await getAuth();
  if (requestGeneration !== cacheGeneration) {
    return result;
  }
  if (!result) {
    cached = null;
    lastFetchTime = 0;
    invalidateAdminUsersCache();
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
      ? {
          permissions: result.permissions,
          policiesPending: result.policiesPending,
          session: result.session,
        }
      : { permissions: [] as string[], policiesPending: false, session: null };
  }

  if (cached && Date.now() - lastFetchTime < CACHE_TTL) {
    return {
      permissions: cached.permissions,
      policiesPending: cached.policiesPending,
      session: cached.session,
    };
  }

  // Dedup concurrent calls — all preload-triggered beforeLoad calls
  // share a single in-flight fetch instead of each firing independently.
  if (!inflight) {
    const request = fetchAuth(cacheGeneration).finally(() => {
      if (inflight === request) {
        inflight = null;
      }
    });
    inflight = request;
  }

  const result = await inflight;
  if (!result) {
    return {
      permissions: [] as string[],
      policiesPending: false,
      session: null,
    };
  }

  return {
    permissions: result.permissions,
    policiesPending: result.policiesPending,
    session: result.session,
  };
}

export function invalidateAuthCache() {
  cacheGeneration += 1;
  cached = null;
  lastFetchTime = 0;
  inflight = null;
  invalidateAdminUsersCache();
  clearPendingKalakritiAccessRequests();
}
