import NotificationEmail from "./notification-email";

export default function WithLineItems() {
  return (
    <NotificationEmail
      ctaLabel="View Reimbursement"
      ctaUrl="https://dash.proudindian.ngo/reimbursements/reimb-456"
      heading="Reimbursement Submitted"
      lineItems={[
        {
          amount: "450",
          categoryName: "Stationery",
          description: "Pens and notebooks",
        },
        {
          amount: "1200",
          categoryName: "Printing",
          description: "Event flyers",
        },
        { amount: "800", categoryName: "Transport", description: null },
      ]}
      paragraphs={[
        'Rahul Sharma submitted "March Office Supplies" for review.',
      ]}
    />
  );
}
