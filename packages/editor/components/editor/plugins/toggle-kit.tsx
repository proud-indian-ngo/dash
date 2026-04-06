"use client";

import { IndentKit } from "@pi-dash/editor/components/editor/plugins/indent-kit";
import { ToggleElement } from "@pi-dash/editor/components/ui/toggle-node";
import { TogglePlugin } from "@platejs/toggle/react";

export const ToggleKit = [
  ...IndentKit,
  TogglePlugin.withComponent(ToggleElement),
];
