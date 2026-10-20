const loadPostHog = () => import("@/lib/posthog");

/** Keep routine analytics downloads behind the page's initial resources. */
export function loadPostHogAfterLoad() {
  if (typeof window === "undefined" || document.readyState === "complete") {
    return loadPostHog();
  }
  return new Promise<void>((resolve) => {
    window.addEventListener("load", () => resolve(), { once: true });
  }).then(loadPostHog);
}
