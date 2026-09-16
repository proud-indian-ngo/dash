import { MAX_BLANK_ID_CARD_PAGES } from "@pi-dash/shared/kalakriti-blank-id-cards";
import { z } from "zod";

const pageCount = z.number().int().min(0).max(MAX_BLANK_ID_CARD_PAGES);

export const blankIdCardPagesSchema = z
  .object({
    volunteerPages: pageCount,
    guestPages: pageCount,
    judgePages: pageCount,
  })
  .refine(
    (pages) => {
      const total = pages.volunteerPages + pages.guestPages + pages.judgePages;
      return total >= 1 && total <= MAX_BLANK_ID_CARD_PAGES;
    },
    {
      message: `Choose between 1 and ${MAX_BLANK_ID_CARD_PAGES} pages in total.`,
      path: ["volunteerPages"],
    }
  );
