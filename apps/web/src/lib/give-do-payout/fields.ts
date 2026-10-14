export const GIVE_DO_PAYOUT_DONATION_HEADERS = [
  "Date",
  "Time",
  "Transaction ID",
  "Campaign ID",
  "Campaign Name",
  "Campaign Link",
  "Fundraiser Name",
  "Donor Name",
  "Donor Address Line 1",
  "Donor Address Line 2",
  "Donor City",
  "Donor Town / State",
  "Donor Country",
  "Donor Zipcode / Pincode",
  "Donor Complete Address",
  "Donor Email",
  "Donor Phone",
  "Donor PAN",
  "Donation Currency",
  "Donation Amount",
  "Converted Currency (If International)",
  "Converted Amount (If International)",
  "Payment processing and Applicable promotional charges",
  "Payable Amount",
  "UTR",
] as const;

export const GIVE_DO_PAYOUT_CAMPAIGN_HEADERS = [
  "Campaign ID",
  "Total Donation Amount",
  "Total Retention Amount",
  "Campaign Link",
  "Currency",
  "Total Payable Amount",
  "UTR",
] as const;

export const GIVE_DO_PAYOUT_DONATIONS_SHEET = "Donations";
export const GIVE_DO_PAYOUT_CAMPAIGN_SHEET = "Campaign Level";
