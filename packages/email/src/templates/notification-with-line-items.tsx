import NotificationEmail from "./notification-email";

export default function WithLineItems() {
  return (
    <NotificationEmail
      ctaLabel="Review reimbursement"
      ctaUrl="https://dash.proudindian.ngo/reimbursements/reimb-456"
      heading="New reimbursement to review"
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
      status={{ label: "Needs review", tone: "warning" }}
      paragraphs={[
        'Rahul Sharma submitted "March Office Supplies" for review.',
      ]}
    />
  );
}
