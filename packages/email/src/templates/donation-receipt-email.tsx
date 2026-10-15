import { EmailHeading, EmailLayout, EmailText } from "./email-layout";

export interface DonationReceiptEmailProps {
  amount: string;
  appName?: string;
  appUrl?: string;
  donorName: string;
  number: string;
  orgName: string;
  receivedOn: string;
}

/** The donor's copy of a receipt; the PDF is attached. */
export default function DonationReceiptEmail({
  amount,
  appName,
  appUrl,
  donorName,
  number,
  orgName,
  receivedOn,
}: DonationReceiptEmailProps) {
  return (
    <EmailLayout
      appName={appName}
      appUrl={appUrl}
      preview={`Your donation receipt ${number} from ${orgName}`}
    >
      <EmailHeading>Thank you for your donation</EmailHeading>
      <EmailText>Dear {donorName},</EmailText>
      <EmailText>
        Thank you for your donation of {amount} received on {receivedOn}. Your
        receipt {number} is attached to this email as a PDF.
      </EmailText>
      <EmailText>
        Please keep it for your records. If any detail on it is wrong, reply to
        this email and we will correct it.
      </EmailText>
      <EmailText>With gratitude, {orgName}</EmailText>
    </EmailLayout>
  );
}

DonationReceiptEmail.PreviewProps = {
  amount: "₹5,000.00",
  donorName: "Test Donor",
  number: "PI/2026-27/0001",
  orgName: "Example Trust",
  receivedOn: "1 May 2026",
} satisfies DonationReceiptEmailProps;
