import { toast } from "sonner";

const CHECK_INTERVAL_MS = 5 * 60_000;
// Focus checks closer together than this reuse the last result.
const MIN_CHECK_GAP_MS = 60_000;
const TOAST_ID = "new-version";

/**
 * The build the server is running, or null when it can't be read (a deploy
 * in progress, offline), so the next check decides.
 */
export async function fetchBuildId(
  fetchVersion: () => Promise<Response> = () =>
    fetch("/api/version", { cache: "no-store" })
): Promise<string | null> {
  try {
    const response = await fetchVersion();
    if (!response.ok) {
      return null;
    }
    const body: unknown = await response.json();
    const buildId =
      typeof body === "object" && body !== null && "buildId" in body
        ? body.buildId
        : undefined;
    return typeof buildId === "string" ? buildId : null;
  } catch {
    return null;
  }
}

function showNewVersionToast() {
  toast("A new version of pi-dash is available", {
    action: { label: "Reload", onClick: () => window.location.reload() },
    description: "Reload to get the latest changes.",
    duration: Number.POSITIVE_INFINITY,
    id: TOAST_ID,
  });
}

/**
 * Notes the server's build when the page loads, then checks again every few
 * minutes and when the tab becomes visible; a different build shows a toast
 * that stays until the page reloads. The client bundle deliberately doesn't
 * embed the build ID: chunk hashes include the names of the chunks they
 * import, so a per-build value would rename almost every chunk on every
 * deploy. Returns a cleanup function.
 */
export function watchForNewVersion(): () => void {
  if (import.meta.env.DEV) {
    return () => undefined;
  }
  let loadedBuildId: string | null = null;
  let lastCheckAt = 0;
  let found = false;

  const check = async (force = false) => {
    if (found || (!force && Date.now() - lastCheckAt < MIN_CHECK_GAP_MS)) {
      return;
    }
    lastCheckAt = Date.now();
    const buildId = await fetchBuildId();
    if (buildId === null) {
      return;
    }
    if (loadedBuildId === null) {
      loadedBuildId = buildId;
    } else if (buildId !== loadedBuildId) {
      found = true;
      showNewVersionToast();
    }
  };
  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") {
      check();
    }
  };

  check(true);
  const interval = window.setInterval(check, CHECK_INTERVAL_MS);
  document.addEventListener("visibilitychange", onVisibilityChange);
  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
