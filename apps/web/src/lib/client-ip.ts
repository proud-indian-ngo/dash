/**
 * Trusted client IP for rate limiting. Production is only reachable through
 * Cloudflare; otherwise the right-most forwarded hop was appended by our
 * proxy, while left-most entries can be client-controlled.
 */
export function trustedClientIp(request: Request): string | undefined {
  return (
    request.headers.get("cf-connecting-ip")?.trim() ||
    request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    undefined
  );
}
