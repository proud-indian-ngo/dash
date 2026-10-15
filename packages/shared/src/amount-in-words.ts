import { assertSafePaise } from "./money";

/**
 * An amount in Indian English words, grouped in crores, lakhs and
 * thousands, as receipts print it: 1,25,050.50 is "One lakh twenty-five
 * thousand fifty rupees and fifty paise".
 */

const ONES = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
  "ten",
  "eleven",
  "twelve",
  "thirteen",
  "fourteen",
  "fifteen",
  "sixteen",
  "seventeen",
  "eighteen",
  "nineteen",
];

const TENS = [
  "",
  "",
  "twenty",
  "thirty",
  "forty",
  "fifty",
  "sixty",
  "seventy",
  "eighty",
  "ninety",
];

function belowHundred(n: number): string {
  if (n < 20) {
    return ONES[n] ?? "";
  }
  const ten = TENS[Math.floor(n / 10)] ?? "";
  const one = n % 10;
  return one === 0 ? ten : `${ten}-${ONES[one]}`;
}

function belowThousand(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} hundred`);
  }
  if (rest > 0) {
    parts.push(belowHundred(rest));
  }
  return parts.join(" ");
}

/** A whole number in Indian words (lower case); 0 is "zero". */
export function integerToIndianWords(value: number): string {
  if (!(Number.isSafeInteger(value) && value >= 0)) {
    throw new Error(`Not a whole number: ${value}`);
  }
  if (value === 0) {
    return "zero";
  }
  const parts: string[] = [];
  const crores = Math.floor(value / 10_000_000);
  let rest = value % 10_000_000;
  if (crores > 0) {
    parts.push(`${integerToIndianWords(crores)} crore`);
  }
  const lakhs = Math.floor(rest / 100_000);
  rest %= 100_000;
  if (lakhs > 0) {
    parts.push(`${belowHundred(lakhs)} lakh`);
  }
  const thousands = Math.floor(rest / 1000);
  rest %= 1000;
  if (thousands > 0) {
    parts.push(`${belowHundred(thousands)} thousand`);
  }
  if (rest > 0) {
    parts.push(belowThousand(rest));
  }
  return parts.join(" ");
}

const capitalise = (text: string) =>
  text.charAt(0).toUpperCase() + text.slice(1);

/** Paise as "One lakh twenty-five thousand fifty rupees and fifty paise". */
export function paiseToIndianWords(amountPaise: number): string {
  assertSafePaise(amountPaise);
  if (amountPaise < 0) {
    throw new Error("Amount can't be negative");
  }
  const rupees = Math.floor(amountPaise / 100);
  const paise = amountPaise % 100;
  const rupeeWords = `${integerToIndianWords(rupees)} ${rupees === 1 ? "rupee" : "rupees"}`;
  const paiseWords = `${integerToIndianWords(paise)} ${paise === 1 ? "paisa" : "paise"}`;
  if (paise === 0) {
    return capitalise(rupeeWords);
  }
  if (rupees === 0) {
    return capitalise(paiseWords);
  }
  return capitalise(`${rupeeWords} and ${paiseWords}`);
}
