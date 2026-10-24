"use client";

import { isPlateValue } from "@pi-dash/shared/plate-content";
import { log } from "evlog";
import type { Value } from "platejs";
import { createZustandStore } from "platejs/react";
import { createStaticEditor, PlateStatic } from "platejs/static";
import { Component, type ReactNode, Suspense, useMemo } from "react";

import { BaseBasicBlocksKit } from "../components/editor/plugins/basic-blocks-base-kit";
import { BaseBasicMarksKit } from "../components/editor/plugins/basic-marks-base-kit";
import { BaseCodeBlockKit } from "../components/editor/plugins/code-block-base-kit";
import { BaseLinkKit } from "../components/editor/plugins/link-base-kit";
import { BaseListKit } from "../components/editor/plugins/list-classic-base-kit";
import { BaseMediaKit } from "../components/editor/plugins/media-base-kit";
import { BaseMentionKit } from "../components/editor/plugins/mention-base-kit";
import { BaseTableKit } from "../components/editor/plugins/table-base-kit";
import { BaseToggleKit } from "../components/editor/plugins/toggle-base-kit";

const rendererPlugins = [
  ...BaseBasicBlocksKit,
  ...BaseBasicMarksKit,
  ...BaseLinkKit,
  ...BaseMediaKit,
  ...BaseCodeBlockKit,
  ...BaseTableKit,
  ...BaseMentionKit,
  ...BaseToggleKit,
  ...BaseListKit,
];

export interface RendererProps {
  className?: string;
  content: string;
}

const contentFallback = (
  <p className="text-muted-foreground text-sm">
    Unable to display this content.
  </p>
);

class RendererBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    log.error({
      component: "PlateRenderer",
      action: "renderContent",
      error: "Content renderer failed",
    });
  }

  render() {
    return this.state.failed ? contentFallback : this.props.children;
  }
}

function parseContent(content: string): Value | undefined {
  try {
    const value = JSON.parse(content);
    return isPlateValue(value) ? value : undefined;
  } catch (caughtError) {
    log.warn({
      action: "parseContent",
      caughtError:
        caughtError instanceof Error
          ? caughtError.message
          : String(caughtError),
      component: "PlateRenderer",
    });
    return undefined;
  }
}

function RenderContent({ content, className }: RendererProps) {
  // Toggle open state lives in the editor's plugin options, so keep one editor
  // per content value and give it React-subscribable option stores.
  const editor = useMemo(() => {
    const value = parseContent(content);
    return (
      value &&
      createStaticEditor({
        optionsStoreFactory: createZustandStore,
        plugins: rendererPlugins,
        value,
      })
    );
  }, [content]);

  if (!editor) {
    return contentFallback;
  }

  return (
    <PlateStatic
      className={`prose prose-sm relative break-words whitespace-pre-wrap ${className}`}
      editor={editor}
    />
  );
}

export function PlateRenderer(props: RendererProps) {
  return (
    <RendererBoundary key={props.content}>
      {/* Suspense contains server render failures; the boundary handles clients. */}
      <Suspense fallback={contentFallback}>
        <RenderContent {...props} />
      </Suspense>
    </RendererBoundary>
  );
}
