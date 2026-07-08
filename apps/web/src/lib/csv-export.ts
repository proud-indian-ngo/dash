function escapeCsvValue(raw: string): string {
  // Prevent CSV injection: prefix formula-triggering characters with a tab
  const firstChar = raw.charAt(0);
  const value =
    firstChar === "=" ||
    firstChar === "+" ||
    firstChar === "-" ||
    firstChar === "@"
      ? `\t${raw}`
      : raw;
  if (
    value.includes(",") ||
    value.includes('"') ||
    value.includes("\n") ||
    value.includes("\t")
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: string[][]
): void {
  const lines = [
    headers.map(escapeCsvValue).join(","),
    ...rows.map((row) => row.map(escapeCsvValue).join(",")),
  ];
  const csvString = lines.join("\n");
  const blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
