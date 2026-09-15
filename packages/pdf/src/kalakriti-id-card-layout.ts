import { Font } from "@react-pdf/renderer";

import { kalakritiIdCardAssets } from "./kalakriti-id-card-assets";
import type { KalakritiIdCardData } from "./kalakriti-id-cards";

Font.register({
  family: "IdCard",
  src: kalakritiIdCardAssets.regularFont,
});
Font.register({
  family: "IdCardBold",
  src: kalakritiIdCardAssets.boldFont,
});

await Promise.all([
  Font.load({ fontFamily: "IdCard" }),
  Font.load({ fontFamily: "IdCardBold" }),
]);

function wrapText(
  value: string,
  width: number,
  size: number,
  bold = false
): string[] {
  const font = Font.getFont({
    fontFamily: bold ? "IdCardBold" : "IdCard",
  }).data;
  if (!font) throw new Error("ID card font is unavailable");
  const lines: string[] = [];
  let line = "";
  for (const word of value.trim().split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (
      (font.layout(candidate).advanceWidth * size) / font.unitsPerEm <=
      width
    ) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (
        line &&
        (font.layout(line + character).advanceWidth * size) / font.unitsPerEm >
          width
      ) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function fitIdCardText(person: KalakritiIdCardData) {
  if (!person.name.trim()) throw new Error("ID card name is required");
  const detail =
    person.type === "student" || person.type === "guardian"
      ? person.centerName
      : person.type === "volunteer"
        ? person.role
        : "";
  for (const nameSize of [21, 17, 14]) {
    const bodySize = nameSize === 14 ? 8.5 : person.type === "student" ? 9 : 10;
    const competitionSize = nameSize === 14 ? 8 : 8.5;
    const name = wrapText(person.name, 211, nameSize, true);
    const details = detail
      .split("\n")
      .flatMap((line) => wrapText(line, 211, bodySize));
    const competitions =
      person.type === "student"
        ? person.competitions.map((competition) => ({
            ...competition,
            lines: wrapText(competition.name, 146, competitionSize, true),
          }))
        : [];
    const height =
      name.length * nameSize * 1.15 +
      (details.length ? 4 + details.length * bodySize * 1.15 : 0) +
      (competitions.length
        ? 5 +
          competitions.reduce(
            (total, competition) =>
              total + competition.lines.length * competitionSize * 1.15 + 2,
            0
          )
        : 0);
    if (height <= 90)
      return {
        height,
        name,
        details,
        competitions,
        nameSize,
        bodySize,
        competitionSize,
      };
  }
  throw new Error(
    "ID card details do not fit above the QR code; shorten the display text or reduce the competition list before printing"
  );
}
