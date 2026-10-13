import NotificationEmail from "./notification-email";

export default function ApprovalWithImage() {
  return (
    <NotificationEmail
      ctaLabel="View Advance Payment"
      ctaUrl="https://dash.proudindian.ngo/advance-payments/ap-789"
      heading="Advance Payment Approved"
      imageUrl="https://placehold.co/400x300/f6f9fc/6b7280?text=Payment+Proof"
      lineItems={[
        {
          amountPaise: 1500000,
          categoryName: "Venue",
          description: "Community hall booking",
        },
        {
          amountPaise: 1250000,
          categoryName: "Catering",
          description: "Lunch for 50 people",
        },
      ]}
      note="Payment has been processed via NEFT. Please check your account within 2 business days."
      paragraphs={[
        'Your advance payment "Event Venue Booking" has been approved.',
      ]}
    />
  );
}
