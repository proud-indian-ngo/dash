import {
  Call02Icon,
  Mail01Icon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons";

import type { ActionMenuAction } from "@/components/shared/responsive-action-menu";
import type { ContactState } from "@/hooks/use-contacts";

const NON_DIGITS = /\D/g;

export function whatsappUrl(phone: string): string {
  return `https://wa.me/${phone.replace(NON_DIGITS, "")}`;
}

/**
 * Call, WhatsApp and Email items for an action menu, in their own group.
 * `who` names the person when the menu is not already about them, as in a
 * request's page menu; otherwise the labels show the number and address.
 */
export function contactActions(
  contact: ContactState,
  who?: string
): ActionMenuAction[] {
  if (contact === "loading" || contact === "failed") {
    return [
      {
        disabled: true,
        group: "contact",
        icon: Call02Icon,
        id: "contact-status",
        label:
          contact === "loading" ? "Loading contact…" : "Contact unavailable",
      },
    ];
  }
  if (!contact) {
    return [];
  }
  const actions: ActionMenuAction[] = [];
  const { email, phone } = contact;
  if (phone) {
    const call = who ? `Call ${who}` : `Call ${phone}`;
    const whatsapp = who ? `WhatsApp ${who}` : "WhatsApp";
    actions.push(
      {
        group: "contact",
        icon: Call02Icon,
        id: "call",
        label: call,
        render: <a aria-label={call} href={`tel:${phone}`} />,
      },
      {
        group: "contact",
        icon: WhatsappIcon,
        id: "whatsapp",
        label: whatsapp,
        render: (
          <a
            aria-label={whatsapp}
            href={whatsappUrl(phone)}
            rel="noopener noreferrer"
            target="_blank"
          />
        ),
      }
    );
  }
  const mail = who ? `Email ${who}` : `Email ${email}`;
  actions.push({
    group: "contact",
    icon: Mail01Icon,
    id: "email",
    label: (
      <span className="max-w-72 truncate" title={email}>
        {mail}
      </span>
    ),
    render: <a aria-label={mail} href={`mailto:${email}`} />,
  });
  return actions;
}
