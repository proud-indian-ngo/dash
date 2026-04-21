import { Column, Hr, Img, Link, Row, Section, Text } from "react-email";

const socials = [
  {
    name: "Facebook",
    url: "https://www.facebook.com/proudIndianbengaluru",
    icon: "https://img.icons8.com/ios-filled/24/79697b/facebook-new.png",
  },
  {
    name: "Instagram",
    url: "https://www.instagram.com/proudindian_ngo/",
    icon: "https://img.icons8.com/ios-filled/24/79697b/instagram-new.png",
  },
  {
    name: "LinkedIn",
    url: "https://www.linkedin.com/company/proud-indian",
    icon: "https://img.icons8.com/ios-filled/24/79697b/linkedin.png",
  },
  {
    name: "YouTube",
    url: "https://www.youtube.com/@ProudIndianngo",
    icon: "https://img.icons8.com/ios-filled/24/79697b/youtube-play.png",
  },
] as const;

/** Attribution row with copyright + social icons. Sits inside the card. */
export function EmailFooterBar() {
  const year = new Date().getFullYear();

  return (
    <>
      <Hr
        className="m-0"
        style={{
          borderTop: "1px solid #e7e4e7",
          borderBottom: "none",
          borderLeft: "none",
          borderRight: "none",
        }}
      />
      <Section className="px-8 py-4">
        <Row>
          <Column className="align-middle">
            <Text className="m-0 text-[12px] text-subtle leading-4">
              &copy;{year} Proud Indian NGO
            </Text>
          </Column>
          <Column className="text-right align-middle">
            {socials.map((social, i) => (
              <Link
                className="no-underline"
                href={social.url}
                key={social.name}
                style={{ marginLeft: i > 0 ? "10px" : "0" }}
              >
                <Img
                  alt={social.name}
                  className="inline-block"
                  height="16"
                  src={social.icon}
                  width="16"
                />
              </Link>
            ))}
          </Column>
        </Row>
      </Section>
    </>
  );
}

interface EmailPreferencesLinkProps {
  appUrl?: string;
}

/** Preferences link. Sits outside the card, for notification emails only. */
export function EmailPreferencesLink({
  appUrl = "https://dash.proudindian.ngo",
}: EmailPreferencesLinkProps) {
  return (
    <Section className="pt-3.5">
      <Text className="m-0 text-[11px] text-subtle leading-4">
        <Link
          className="text-subtle underline"
          href={`${appUrl}/settings/notifications`}
        >
          Manage notification preferences
        </Link>
      </Text>
    </Section>
  );
}
