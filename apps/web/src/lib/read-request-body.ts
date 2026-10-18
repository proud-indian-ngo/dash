/** Largest body accepted by signed webhook endpoints. */
export const MAX_SIGNED_WEBHOOK_BODY_BYTES = 1024 * 1024;

export type RequestBody =
  | { ok: true; text: string }
  | { ok: false; reason: "aborted" | "timeout" | "too_large" };

/**
 * Read a request body without buffering past the byte limit. The limit is
 * checked from Content-Length first and then against the bytes read, so it
 * also covers chunked requests. A timeout or oversized body cancels the
 * stream.
 */
export async function readRequestBody(
  request: Request,
  {
    maxBytes = MAX_SIGNED_WEBHOOK_BODY_BYTES,
    timeoutMs = 3000,
  }: { maxBytes?: number; timeoutMs?: number } = {}
): Promise<RequestBody> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) {
    void request.body?.cancel().catch(() => undefined);
    return { ok: false, reason: "too_large" };
  }
  if (!request.body) {
    return { ok: true, text: "" };
  }

  const reader = request.body.getReader();
  const stop = () => {
    reader.cancel().catch(() => undefined);
  };
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    for (;;) {
      const next = await Promise.race([
        reader.read().catch(() => "aborted" as const),
        timeout,
      ]);
      if (next === "aborted") {
        stop();
        return { ok: false, reason: "aborted" };
      }
      if (next === "timeout") {
        stop();
        return { ok: false, reason: "timeout" };
      }
      if (next.done) {
        break;
      }
      size += next.value.byteLength;
      if (size > maxBytes) {
        stop();
        return { ok: false, reason: "too_large" };
      }
      chunks.push(next.value);
    }
  } finally {
    clearTimeout(timer);
  }

  return { ok: true, text: Buffer.concat(chunks).toString("utf8") };
}
