import {
  MAX_BLANK_ID_CARD_PAGES,
  type BlankIdCardPages,
} from "@pi-dash/shared/kalakriti-blank-id-cards";
import { renderToBuffer } from "@react-pdf/renderer";
import { uuidv7 } from "uuidv7";

import {
  KalakritiIdCards,
  type KalakritiBlankIdCardData,
} from "./kalakriti-id-cards";

export async function generateBlankKalakritiIdCards(pages: BlankIdCardPages) {
  const counts = [pages.volunteerPages, pages.guestPages, pages.judgePages];
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (
    counts.some((count) => !Number.isInteger(count) || count < 0) ||
    total < 1 ||
    total > MAX_BLANK_ID_CARD_PAGES
  ) {
    throw new Error(
      `Choose between 1 and ${MAX_BLANK_ID_CARD_PAGES} pages in total`
    );
  }
  const people: KalakritiBlankIdCardData[] = [];
  for (const type of ["volunteer", "guest", "judge"] as const) {
    for (let index = 0; index < pages[`${type}Pages`] * 4; index++) {
      people.push({ id: uuidv7(), type, blank: true });
    }
  }
  return renderToBuffer(<KalakritiIdCards people={people} />);
}
