import { parseKalakritiPersonQr } from "@pi-dash/shared/kalakriti-person-qr";
import { renderToBuffer } from "@react-pdf/renderer";

import { fitIdCardText } from "./kalakriti-id-card-layout";
import {
  KalakritiIdCards,
  type KalakritiIdCardData,
} from "./kalakriti-id-cards";

export async function generateKalakritiIdCards(people: KalakritiIdCardData[]) {
  if (people.length === 0)
    throw new Error("Select at least one person to print");
  for (const person of people) {
    parseKalakritiPersonQr(
      JSON.stringify({ id: person.id, type: person.type })
    );
    fitIdCardText(person);
  }
  return renderToBuffer(<KalakritiIdCards people={people} />);
}
