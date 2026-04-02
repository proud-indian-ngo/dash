import NotificationEmail from "./notification-email";

export default function Minimal() {
  return (
    <NotificationEmail
      heading="Account Suspended"
      paragraphs={[
        "Your account has been suspended due to policy violations.",
        "Please contact an administrator for more information.",
      ]}
    />
  );
}
