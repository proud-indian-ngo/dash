/**
 * A synthetic Form 114 certificate for tests: a one-page PDF with plain
 * Helvetica text, laid out as the portal's certificate is assumed to read
 * (see certificate-parser.ts). Never real donor data.
 */

export interface SyntheticCertificate {
  acknowledgementNumber: string;
  amount: string;
  donationType: string;
  donorName: string;
  idNumber: string;
  mode: string;
  /** The row's Pre-ARN, when the certificate carries one. */
  preArn?: string;
}

const escapePdfText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");

/** A minimal valid PDF drawing each line in order. */
export function syntheticPdf(lines: readonly string[]): Uint8Array {
  const text = lines
    .map((line, index) =>
      index === 0
        ? `(${escapePdfText(line)}) Tj`
        : `0 -16 Td (${escapePdfText(line)}) Tj`
    )
    .join("\n");
  const stream = `BT /F1 11 Tf 50 790 Td\n${text}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

export function syntheticCertificatePdf(
  certificate: SyntheticCertificate
): Uint8Array {
  return syntheticPdf([
    "FORM NO. 114",
    "Certificate of donation under section 354(1)(g)",
    `Acknowledgement Number: ${certificate.acknowledgementNumber}`,
    "Name of the donee: E2E Test Trust",
    "PAN of the donee: AAATE0000E",
    `Name of the donor: ${certificate.donorName}`,
    `Unique Identification Number of the donor: ${certificate.idNumber}`,
    ...(certificate.preArn
      ? [`Pre-Acknowledgement Number: ${certificate.preArn}`]
      : []),
    `Donation Type: ${certificate.donationType}`,
    `Mode of receipt: ${certificate.mode}`,
    `Amount of donation (Indian Rupees): ${certificate.amount}`,
    "Tax year: 2026-27",
  ]);
}
