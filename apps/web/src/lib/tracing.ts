function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function generateTraceId(): string {
  return randomHex(16);
}

export function generateSpanId(): string {
  return randomHex(8);
}

export function formatTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`;
}

export function installFetchTracing(): void {
  if (typeof window === "undefined") {
    return;
  }

  const originalFetch = window.fetch;
  const tracedFetch: typeof fetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = input instanceof Request ? input.url : String(input);
      const isSameOrigin =
        url.startsWith("/") || url.startsWith(window.location.origin);
      if (!isSameOrigin) {
        return originalFetch(input, init);
      }
      const headers = new Headers(init?.headers);
      if (!headers.has("traceparent")) {
        const traceId = generateTraceId();
        const spanId = generateSpanId();
        headers.set("traceparent", formatTraceparent(traceId, spanId));
      }
      return originalFetch(input, { ...init, headers });
    },
    originalFetch
  );
  window.fetch = tracedFetch;
}
