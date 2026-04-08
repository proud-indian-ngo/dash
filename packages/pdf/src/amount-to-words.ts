const ones = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
];

const teens = [
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const tens = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function convertBelowThousand(num: number): string {
  if (num === 0) {
    return "";
  }
  if (num < 10) {
    return ones[num] ?? "";
  }
  if (num < 20) {
    return teens[num - 10] ?? "";
  }
  if (num < 100) {
    const tenDigit = Math.floor(num / 10);
    const oneDigit = num % 10;
    return (
      (tens[tenDigit] ?? "") + (oneDigit > 0 ? ` ${ones[oneDigit] ?? ""}` : "")
    );
  }
  const hundredDigit = Math.floor(num / 100);
  const remainder = num % 100;
  return (
    ones[hundredDigit] +
    " Hundred" +
    (remainder > 0 ? ` ${convertBelowThousand(remainder)}` : "")
  );
}

export function amountToWords(amount: number): string {
  if (amount === 0) {
    return "Rupees Zero Only";
  }

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  let rupeesWords = "";

  if (rupees === 0) {
    rupeesWords = "Zero";
  } else if (rupees < 1000) {
    rupeesWords = convertBelowThousand(rupees);
  } else if (rupees < 100_000) {
    const thousands = Math.floor(rupees / 1000);
    const remainder = rupees % 1000;
    const remainderWords =
      remainder > 0 ? ` ${convertBelowThousand(remainder)}` : "";
    rupeesWords = `${convertBelowThousand(thousands)} Thousand${remainderWords}`;
  } else {
    const lakhs = Math.floor(rupees / 100_000);
    const remainder = rupees % 100_000;
    const remainderWords =
      remainder > 0 ? ` ${convertBelowThousand(remainder)}` : "";
    rupeesWords = `${convertBelowThousand(lakhs)} Lakh${remainderWords}`;
  }

  let result = `Rupees ${rupeesWords}`;

  if (paise > 0) {
    result += ` and Paise ${convertBelowThousand(paise)}`;
  }

  result += " Only";

  return result;
}
