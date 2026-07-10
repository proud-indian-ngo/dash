"use client";

import { PlateRenderer as _Renderer } from "@pi-dash/editor/renderer";
import { env } from "@pi-dash/env/web";
import {
  buildEventUpdateMediaUrl,
  parseEventUpdateMediaKey,
  transformPlateImageUrls,
} from "@pi-dash/shared/media-url";
import type * as React from "react";

interface PlateRendererProps extends React.ComponentProps<typeof _Renderer> {
  eventId: string;
}

export function PlateRenderer({
  content,
  eventId,
  ...props
}: PlateRendererProps) {
  const protectedContent = transformPlateImageUrls(content, (url) => {
    const key = parseEventUpdateMediaKey(url, {
      eventId,
      legacyCdnUrl: env.VITE_CDN_URL,
    });
    return key ? buildEventUpdateMediaUrl(eventId, key) : url;
  }).content;
  return <_Renderer {...props} content={protectedContent} />;
}
