/** Cookie-authenticated writes must agree with every browser origin signal. */
export function isSessionRequestAllowed(
  request: Request,
  trustedOrigin: string
): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    return true;
  }

  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin") {
    return false;
  }

  const origin = request.headers.get("origin");
  if (origin !== null) {
    return origin === new URL(trustedOrigin).origin;
  }

  const referer = request.headers.get("referer");
  if (referer !== null) {
    return URL.parse(referer)?.origin === new URL(trustedOrigin).origin;
  }

  // zero-cache forwards session cookies without browser headers. Never exempt
  // a path: browser requests to those same endpoints still need these checks.
  return (
    site === "same-origin" ||
    !["sec-fetch-mode", "sec-fetch-dest", "sec-fetch-user"].some((header) =>
      request.headers.has(header)
    )
  );
}
