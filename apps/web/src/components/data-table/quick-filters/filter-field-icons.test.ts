import { describe, expect, it } from "bun:test";

import { Calendar03Icon } from "@hugeicons/core-free-icons";

import { COLUMN_ICONS } from "../column-icons";
import { columnIcon } from "../column-kinds";
import { dateField, selectField } from "../filter-fields";
import { filterFieldIcons } from "./filter-field-icons";

const programme = selectField("programme", "Programme", [
  { label: "Education", value: "education" },
]);
const submitted = dateField("submitted", "Submitted");

describe("filterFieldIcons", () => {
  it("uses the column's header icon, else one by filter type", () => {
    const icons = filterFieldIcons(
      [programme, submitted],
      [
        {
          id: "programme",
          meta: { icon: COLUMN_ICONS.programme, kind: "text" },
        },
      ]
    );
    expect(icons.get("programme")).toBe(COLUMN_ICONS.programme);
    expect(icons.get("submitted")).toBe(Calendar03Icon);
  });

  it("matches the kind icon for columns without their own", () => {
    const column = { id: "programme", meta: { kind: "tag" as const } };
    expect(filterFieldIcons([programme], [column]).get("programme")).toBe(
      columnIcon(column)
    );
  });
});
