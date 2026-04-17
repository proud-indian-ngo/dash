import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AppContext } from "@/context/app-context";

vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: () => createElement("span", null, "icon"),
}));

vi.mock("@pi-dash/design-system/components/reui/badge", () => ({
  Badge: ({ children }: { children?: ReactNode }) =>
    createElement("span", null, children),
}));

vi.mock("@pi-dash/design-system/components/ui/hover-card", () => ({
  HoverCard: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  HoverCardContent: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  HoverCardTrigger: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));

vi.mock("@/components/shared/user-avatar", () => ({
  UserAvatar: ({ user }: { user: { name: string } }) =>
    createElement("span", null, `${user.name} avatar`),
}));

import { UserHoverCard } from "./user-hover-card";

const tooltipUser = {
  id: "user-2",
  name: "Other User",
  email: "other@example.com",
  phone: "+91 99999 99999",
  role: "volunteer",
  createdAt: "2024-01-15T00:00:00.000Z",
};

function renderHoverCard({
  permissions,
  appUserId,
}: {
  appUserId: string;
  permissions: string[];
}) {
  return renderToStaticMarkup(
    createElement(
      AppContext,
      {
        value: {
          hasPermission: (permission) => permissions.includes(permission),
          navGroups: [],
          navItems: [],
          openSettings: () => undefined,
          permissions,
          setSettingsOpen: () => undefined,
          setSettingsSection: () => undefined,
          settingsOpen: false,
          settingsSection: "profile",
          user: {
            id: appUserId,
            name: "Current User",
            email: "current@example.com",
            role: "volunteer",
          },
        },
      },
      createElement(
        UserHoverCard,
        { user: tooltipUser },
        createElement("span", null, "Trigger")
      )
    )
  );
}

describe("UserHoverCard", () => {
  it("shows full details for viewers with users.view", () => {
    const markup = renderHoverCard({
      appUserId: "user-1",
      permissions: ["users.view"],
    });

    expect(markup).toContain("Other User");
    expect(markup).toContain("other@example.com");
    expect(markup).toContain("+91 99999 99999");
    expect(markup).toContain("volunteer");
    expect(markup).toContain("Joined January 15, 2024");
  });

  it("redacts contact and join details for other users without users.view", () => {
    const markup = renderHoverCard({
      appUserId: "user-1",
      permissions: [],
    });

    expect(markup).toContain("Other User");
    expect(markup).toContain("volunteer");
    expect(markup).not.toContain("other@example.com");
    expect(markup).not.toContain("+91 99999 99999");
    expect(markup).not.toContain("Joined January 15, 2024");
  });

  it("shows full details for self without users.view", () => {
    const markup = renderHoverCard({
      appUserId: "user-2",
      permissions: [],
    });

    expect(markup).toContain("other@example.com");
    expect(markup).toContain("+91 99999 99999");
    expect(markup).toContain("Joined January 15, 2024");
  });
});
