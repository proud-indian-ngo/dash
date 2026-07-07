"use client";

import { LinkElement } from "../../ui/link-node";
import { LinkFloatingToolbar } from "../../ui/link-toolbar";
import { LinkPlugin } from "@platejs/link/react";

export const LinkKit = [
  LinkPlugin.configure({
    render: {
      node: LinkElement,
      afterEditable: () => <LinkFloatingToolbar />,
    },
  }),
];
