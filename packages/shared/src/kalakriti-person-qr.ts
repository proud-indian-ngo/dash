export interface KalakritiPersonQr {
  id: string;
  type: "student" | "guardian" | "volunteer";
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseKalakritiPersonQr(value: string): KalakritiPersonQr {
  if (value.length === 0 || value.length > 256) {
    throw new Error("Invalid person QR");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid person QR");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.keys(parsed).length !== 2 ||
    !("id" in parsed) ||
    typeof parsed.id !== "string" ||
    !UUID_PATTERN.test(parsed.id) ||
    !("type" in parsed) ||
    (parsed.type !== "student" &&
      parsed.type !== "guardian" &&
      parsed.type !== "volunteer")
  ) {
    throw new Error("Invalid person QR");
  }
  return { id: parsed.id.toLowerCase(), type: parsed.type };
}
