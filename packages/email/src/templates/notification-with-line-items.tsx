import NotificationEmail from "./notification-email";

export default function WithLineItems() {
  return (
    <NotificationEmail
      ctaLabel="View Reimbursement"
      ctaUrl="https://dash.proudindian.ngo/reimbursements/reimb-456"
      heading="Reimbursement Submitted"
      lineItems={[
        {
          categoryName: "Stationery",
          description: "Pens and notebooks",
          amount: "450",
        },
        {
          categoryName: "Printing",
          description: "Event flyers",
          amount: "1200",
        },
        { categoryName: "Transport", description: null, amount: "800" },
      ]}
      paragraphs={[
        'Rahul Sharma submitted "March Office Supplies" for review.',
      ]}
    />
  );
}
