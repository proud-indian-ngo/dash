"use client";

import { IndentKit } from "./indent-kit";
import { ToggleElement } from "../../ui/toggle-node";
import { TogglePlugin } from "@platejs/toggle/react";

export const ToggleKit = [
  ...IndentKit,
  TogglePlugin.withComponent(ToggleElement),
];
