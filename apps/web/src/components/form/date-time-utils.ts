/** Apply a time change to a base Date, returning a new Date. */
export function applyTimeChange(
  base: Date,
  type: "hour" | "minute" | "ampm",
  val: string
): Date {
  const result = new Date(base);
  if (type === "hour") {
    const isPM = result.getHours() >= 12;
    result.setHours((Number.parseInt(val, 10) % 12) + (isPM ? 12 : 0));
  } else if (type === "minute") {
    result.setMinutes(Number.parseInt(val, 10));
  } else if (type === "ampm") {
    const currentHours = result.getHours();
    if (val === "PM" && currentHours < 12) {
      result.setHours(currentHours + 12);
    } else if (val === "AM" && currentHours >= 12) {
      result.setHours(currentHours - 12);
    }
  }
  return result;
}
