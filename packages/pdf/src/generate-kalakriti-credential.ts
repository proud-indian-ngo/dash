import { Document, renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";

import {
  createCredentialQrDataUri,
  KalakritiCredentialCard,
  type KalakritiCredentialCardProps,
} from "./kalakriti-credential-card";

export interface KalakritiCredentialPrintCardInput extends Omit<
  KalakritiCredentialCardProps,
  "qrPngDataUri"
> {
  qrToken: string;
}

export async function generateKalakritiCredentialPdf(
  cards: readonly KalakritiCredentialPrintCardInput[]
): Promise<Buffer> {
  const pages = await Promise.all(
    cards.map(async (card) => ({
      ...card,
      qrPngDataUri: await createCredentialQrDataUri(card.qrToken),
    }))
  );
  return renderToBuffer(
    createElement(
      Document,
      null,
      pages.map((page) => createElement(KalakritiCredentialCard, page))
      // biome-ignore lint/suspicious/noExplicitAny: react-pdf types require this
    ) as any
  );
}
