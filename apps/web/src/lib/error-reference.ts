import { generateTraceId } from "@/lib/tracing";

const references = new WeakMap<object, string>();

/**
 * One stable reference per error object, so the log entry, the PostHog
 * exception and the "Reference" shown on the error page all carry the same id.
 */
export function getErrorReference(error: unknown): string {
  if (typeof error !== "object" || error === null) {
    return generateTraceId();
  }
  let reference = references.get(error);
  if (!reference) {
    reference = generateTraceId();
    references.set(error, reference);
  }
  return reference;
}
