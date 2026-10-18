import { beforeEach, describe, expect, it, mock } from "bun:test";

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { AppContext } from "@/context/app-context";

const getUserHoverDetails = mock(async () => ({
  createdAt: new Date("2024-01-15T00:00:00.000Z").getTime(),
  email: "other@example.com",
  phone: "+91 99999 99999",
}));
let onOpenChange: ((open: boolean) => void) | undefined;

mock.module("@hugeicons/react", () => ({
  HugeiconsIcon: () => createElement("span", null, "icon"),
}));

mock.module("@pi-dash/design-system/components/ui/hover-card", () => ({
  HoverCard: ({
    children,
    onOpenChange: handleOpenChange,
  }: {
    children?: ReactNode;
    onOpenChange?: (open: boolean) => void;
  }) => {
    onOpenChange = handleOpenChange;
    return createElement("div", null, children);
  },
  HoverCardContent: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
  HoverCardTrigger: ({ children }: { children?: ReactNode }) =>
    createElement("div", null, children),
}));

mock.module("@/functions/user-hover-details", () => ({
  getUserHoverDetails,
}));

mock.module("@/components/shared/user-avatar", () => ({
  UserAvatar: ({ user }: { user: { name: string } }) =>
    createElement("span", null, `${user.name} avatar`),
}));

import { UserHoverCard } from "./user-hover-card";

const tooltipUser = {
  id: "user-2",
  image: null,
  name: "Other User",
  role: "volunteer",
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
          permissions,
          user: {
            email: "current@example.com",
            id: appUserId,
            name: "Current User",
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
  beforeEach(() => {
    mock.clearAllMocks();
    onOpenChange = undefined;
  });

  it("loads details when a users.view holder opens it", async () => {
    const markup = renderHoverCard({
      appUserId: "user-1",
      permissions: ["users.view"],
    });

    expect(markup).toContain("Other User");
    expect(markup).toContain("volunteer");
    expect(markup).not.toContain("other@example.com");
    expect(getUserHoverDetails).not.toHaveBeenCalled();

    onOpenChange?.(true);
    await Promise.resolve();

    expect(getUserHoverDetails).toHaveBeenCalledWith({
      data: { userId: "user-2" },
    });
  });

  it("does not request details for another user without users.view", () => {
    const markup = renderHoverCard({
      appUserId: "user-1",
      permissions: [],
    });

    expect(markup).toContain("Other User");
    expect(markup).toContain("volunteer");
    expect(markup).not.toContain("other@example.com");
    expect(markup).not.toContain("+91 99999 99999");
    expect(markup).not.toContain("Joined 15 Jan 2024");

    onOpenChange?.(true);

    expect(getUserHoverDetails).not.toHaveBeenCalled();
  });

  it("loads details for self without users.view", async () => {
    const markup = renderHoverCard({
      appUserId: "user-2",
      permissions: [],
    });

    expect(markup).toContain("Other User");
    expect(markup).not.toContain("other@example.com");
    expect(getUserHoverDetails).not.toHaveBeenCalled();

    onOpenChange?.(true);
    await Promise.resolve();

    expect(getUserHoverDetails).toHaveBeenCalledWith({
      data: { userId: "user-2" },
    });
  });
});
