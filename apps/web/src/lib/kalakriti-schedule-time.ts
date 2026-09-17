export const DATE_TIME_LOCAL_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function dateTimeParts(timestamp: number, formatter: Intl.DateTimeFormat) {
  return Object.fromEntries(
    formatter
      .formatToParts(new Date(timestamp))
      .map((part) => [part.type, part.value])
  );
}

export function formatEditionDateTime(
  timestamp: number,
  formatter: Intl.DateTimeFormat
): string {
  const parts = dateTimeParts(timestamp, formatter);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

export function parseEditionDateTime(
  value: string,
  formatter: Intl.DateTimeFormat
): number {
  const match = DATE_TIME_LOCAL_PATTERN.exec(value);
  if (!match) {
    return Number.NaN;
  }
  const guess = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5])
  );
  const zonedGuess = dateTimeParts(guess, formatter);
  const offset =
    Date.UTC(
      Number(zonedGuess.year),
      Number(zonedGuess.month) - 1,
      Number(zonedGuess.day),
      Number(zonedGuess.hour),
      Number(zonedGuess.minute)
    ) - guess;
  return guess - offset;
}
