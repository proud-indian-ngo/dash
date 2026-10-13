import NotificationEmail from "./notification-email";

export default function WithLineItems() {
  return (
    <NotificationEmail
      ctaLabel="View Reimbursement"
      ctaUrl="https://dash.proudindian.ngo/reimbursements/reimb-456"
      heading="Reimbursement Submitted"
      lineItems={[
        {
          amountPaise: 45000,
          categoryName: "Stationery",
          description: "Pens and notebooks",
        },
        {
          amountPaise: 120000,
          categoryName: "Printing",
          description: "Event flyers",
        },
        { amountPaise: 80000, categoryName: "Transport", description: null },
      ]}
      paragraphs={[
        'Rahul Sharma submitted "March Office Supplies" for review.',
      ]}
    />
  );
}
