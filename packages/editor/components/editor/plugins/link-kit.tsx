"use client";

import { LinkElement } from "@pi-dash/editor/components/ui/link-node";
import { LinkFloatingToolbar } from "@pi-dash/editor/components/ui/link-toolbar";
import { LinkPlugin } from "@platejs/link/react";

export const LinkKit = [
  LinkPlugin.configure({
    render: {
      node: LinkElement,
      afterEditable: () => <LinkFloatingToolbar />,
    },
  }),
];
