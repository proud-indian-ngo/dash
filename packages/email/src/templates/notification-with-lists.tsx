import NotificationEmail from "./notification-email";

export default function WithLists() {
  return (
    <NotificationEmail
      ctaLabel="Manage users"
      ctaUrl="https://dash.proudindian.ngo/users"
      heading="WhatsApp scan results"
      lists={[
        {
          items: ["919845012345", "919900112233", "14374382231"],
          title: '3 unregistered phones in "Orientation"',
        },
        {
          items: Array.from(
            { length: 55 },
            (_, i) => `9198450${String(i).padStart(5, "0")}`
          ),
          title: '55 unregistered phones in "All Volunteers"',
        },
      ]}
      paragraphs={["Scanned groups: Orientation, All Volunteers"]}
    />
  );
}
