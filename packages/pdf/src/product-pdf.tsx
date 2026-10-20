import { Font, StyleSheet, type Styles, Text, View } from "@react-pdf/renderer";
import type { ReactNode } from "react";

import { kalakritiIdCardAssets } from "./kalakriti-id-card-assets";
import { receiptAssets } from "./receipt-assets";

/**
 * Fonts, tokens and primitives shared by the documents drawn in the product
 * design language: the donation receipt and the cash voucher.
 */

// The product language's fonts: Geist to read (italics from the Geist
// release, which the design package lacks), Bricolage 600 for the title,
// Paper Mono for the amount, numbers and dates (Bricolage has no ₹).
Font.register({
  family: "ReceiptSans",
  fonts: [
    { fontWeight: 400, src: receiptAssets.sansRegular },
    { fontWeight: 600, src: receiptAssets.sansSemiBold },
    { fontStyle: "italic", fontWeight: 400, src: receiptAssets.sansItalic },
    {
      fontStyle: "italic",
      fontWeight: 600,
      src: receiptAssets.sansSemiBoldItalic,
    },
  ],
});
Font.register({
  family: "ReceiptDisplay",
  fontWeight: 600,
  src: receiptAssets.displaySemiBold,
});
Font.register({
  family: "ReceiptMono",
  fonts: [
    { fontWeight: 400, src: receiptAssets.monoRegular },
    { fontWeight: 500, src: receiptAssets.monoMedium },
  ],
});
// Per-glyph fallback: Geist and Paper Mono lack the dotted IAST letters
// (ṭ ḍ ṇ ṣ ṛ ḥ ṃ ṅ) common in Indian names and places, which Plus Jakarta Sans
// (already bundled for the Kalakriti cards) has. Without it react-pdf would
// substitute a non-embedded Helvetica and print garbage.
Font.register({
  family: "ReceiptFallback",
  fonts: [
    { fontWeight: 400, src: kalakritiIdCardAssets.regularFont },
    { fontWeight: 600, src: kalakritiIdCardAssets.boldFont },
    // No italic: an italic run's fallback glyphs print upright.
    {
      fontStyle: "italic",
      fontWeight: 400,
      src: kalakritiIdCardAssets.regularFont,
    },
    {
      fontStyle: "italic",
      fontWeight: 600,
      src: kalakritiIdCardAssets.boldFont,
    },
  ],
});

export const SANS = ["ReceiptSans", "ReceiptFallback"];
export const DISPLAY = ["ReceiptDisplay", "ReceiptSans", "ReceiptFallback"];
export const MONO = ["ReceiptMono", "ReceiptFallback"];

// Product tokens (light theme), as in `packages/email/src/templates/theme.ts`.
export const INK = "#0F1B24";
export const MUTED = "#5B6670";
export const LINE = "#E7EAED";
export const FIELD = "#F6F7F8";
export const DANGER = "#B3261E";
export const DANGER_WASH = "#FBEAE9";

export const HAIRLINE = `0.75pt solid ${LINE}`;

/** The layout both documents share: A4 margins, header, title row, amount card, facts table, footer. */
export const productStyles = StyleSheet.create({
  amount: { fontFamily: MONO, fontSize: 24, fontWeight: 500 },
  amountCard: {
    backgroundColor: FIELD,
    border: HAIRLINE,
    borderRadius: 7,
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  amountWords: { fontSize: 10, lineHeight: 1.4, marginTop: 6 },
  factLabel: { color: MUTED, width: 110 },
  factRow: {
    borderBottom: HAIRLINE,
    flexDirection: "row",
    paddingVertical: 4.5,
  },
  factValue: { flex: 1 },
  facts: { borderTop: HAIRLINE },
  footer: {
    borderTop: HAIRLINE,
    bottom: 28,
    color: MUTED,
    fontSize: 7.5,
    left: 48,
    paddingTop: 8,
    position: "absolute",
    right: 48,
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  issuer: { alignItems: "flex-end", maxWidth: 270 },
  issuerLine: { color: MUTED, fontSize: 8.5, marginTop: 2, textAlign: "right" },
  issuerName: { fontWeight: 600, textAlign: "right" },
  label: { color: MUTED, fontSize: 8.5, fontWeight: 600, marginBottom: 4 },
  meta: { flexDirection: "row", gap: 24 },
  metaValue: { fontFamily: MONO, fontSize: 10 },
  mono: { fontFamily: MONO },
  name: { fontSize: 13, fontWeight: 600 },
  page: {
    color: INK,
    fontFamily: SANS,
    fontSize: 9.5,
    paddingBottom: 72,
    paddingHorizontal: 48,
    paddingTop: 44,
  },
  section: { marginTop: 18 },
  signatureBlock: {
    borderTop: `0.75pt solid ${INK}`,
    marginTop: 36,
    paddingTop: 5,
  },
  signatureName: { fontWeight: 600 },
  small: { color: MUTED, fontSize: 8.5, marginTop: 2 },
  // react-pdf multiplies a unitless lineHeight by the fontSize in the same
  // style (18 when inherited), so every style with one sets both.
  text: { fontSize: 9.5, lineHeight: 1.45 },
  title: {
    fontFamily: DISPLAY,
    fontSize: 22,
    fontWeight: 600,
    letterSpacing: -0.2,
  },
  titleRow: {
    alignItems: "flex-end",
    borderTop: HAIRLINE,
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 18,
    paddingTop: 16,
  },
});

/** Longest run without spaces kept whole: it fits every column but the signature's. */
const LONGEST_WHOLE_WORD = 40;

/**
 * Names, numbers and legal lines wrap between words, never hyphenated. A
 * longer run with no spaces (a pasted reference) may break between any two
 * characters rather than run off the page; react-pdf draws a hyphen at every
 * such break and has no way to break without one.
 */
export function wholeWords(word: string): string[] {
  return word.length > LONGEST_WHOLE_WORD ? Array.from(word) : [word];
}

export function Line({
  children,
  style,
}: {
  children: ReactNode;
  style?: Styles[string] | Styles[string][];
}) {
  return (
    <Text hyphenationCallback={wholeWords} style={style}>
      {children}
    </Text>
  );
}

export function Fact({
  label,
  mono = false,
  value,
}: {
  label: string;
  mono?: boolean;
  value: string;
}) {
  return (
    <View style={productStyles.factRow}>
      <Text style={productStyles.factLabel}>{label}</Text>
      <Line
        style={
          mono
            ? [productStyles.factValue, productStyles.mono]
            : productStyles.factValue
        }
      >
        {value}
      </Line>
    </View>
  );
}

export function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text style={productStyles.label}>{label}</Text>
      <Text style={productStyles.metaValue}>{value}</Text>
    </View>
  );
}

/** Midnight UTC of a day: a document's fixed creation and modification date. */
export function documentDate(isoDay: string): Date {
  return new Date(`${isoDay}T00:00:00Z`);
}
