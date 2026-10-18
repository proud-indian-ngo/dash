/**
 * Rate-limit identity behind Dokploy's Traefik. The app must not be publicly
 * reachable without the proxy, which appends the peer IP as the right-most
 * forwarded hop. Other entries and provider-specific headers are untrusted.
 */
export function trustedClientIp(request: Request): string | undefined {
  return (
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    undefined
  );
}
