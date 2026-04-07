"use client";

import { PlateRenderer as _Renderer } from "@pi-dash/editor/renderer";
import type * as React from "react";

export function PlateRenderer(props: React.ComponentProps<typeof _Renderer>) {
  return <_Renderer {...props} />;
}
