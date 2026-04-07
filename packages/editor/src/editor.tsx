"use client";

import {
  Image01Icon,
  SourceCodeIcon,
  TextBoldIcon,
  TextItalicIcon,
  TextStrikethroughIcon,
  TextUnderlineIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  ALLOWED_IMAGE_TYPES,
  MAX_IMAGE_SIZE_BYTES,
} from "@pi-dash/shared/constants";
import { CaptionPlugin } from "@platejs/caption/react";
import { ImagePlugin } from "@platejs/media/react";
import { log } from "evlog";
import type { TImageElement, Value } from "platejs";
import { ExitBreakPlugin, KEYS, TrailingBlockPlugin } from "platejs";
import { Plate, useEditorSelector, usePlateEditor } from "platejs/react";
import { type ChangeEvent, type MouseEvent, useRef } from "react";
import { toast } from "sonner";
import { AutoformatKit } from "../components/editor/plugins/autoformat-classic-kit";
import { BasicBlocksKit } from "../components/editor/plugins/basic-blocks-kit";
import { BasicMarksKit } from "../components/editor/plugins/basic-marks-kit";
import { CodeBlockKit } from "../components/editor/plugins/code-block-kit";
import { EmojiKit } from "../components/editor/plugins/emoji-kit";
import { IndentKit } from "../components/editor/plugins/indent-kit";
import { LinkKit } from "../components/editor/plugins/link-kit";
import { ListKit } from "../components/editor/plugins/list-classic-kit";
import { MentionKit } from "../components/editor/plugins/mention-kit";
import { SlashKit } from "../components/editor/plugins/slash-kit";
import { TableKit } from "../components/editor/plugins/table-kit";
import { ToggleKit } from "../components/editor/plugins/toggle-kit";
import { Editor, EditorContainer } from "../components/ui/editor";
import { EmojiToolbarButton } from "../components/ui/emoji-toolbar-button";
import { FixedToolbar } from "../components/ui/fixed-toolbar";
import {
  RedoToolbarButton,
  UndoToolbarButton,
} from "../components/ui/history-toolbar-button";
import {
  IndentToolbarButton,
  OutdentToolbarButton,
} from "../components/ui/indent-toolbar-button";
import { InsertToolbarButton } from "../components/ui/insert-toolbar-button";
import { LinkToolbarButton } from "../components/ui/link-toolbar-button";
import { ListToolbarButton } from "../components/ui/list-classic-toolbar-button";
import { MarkToolbarButton } from "../components/ui/mark-toolbar-button";
import { ImageElement } from "../components/ui/media-image-node";
import { TableToolbarButton } from "../components/ui/table-toolbar-button";
import { ToggleToolbarButton } from "../components/ui/toggle-toolbar-button";
import { ToolbarButton, ToolbarGroup } from "../components/ui/toolbar";
import { TurnIntoToolbarButton } from "../components/ui/turn-into-toolbar-button";

function safeParse(json: string): Value | undefined {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch (error) {
    log.warn({
      component: "PlateEditor",
      action: "parseContent",
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

const editorPlugins = [
  ...BasicBlocksKit,
  ...BasicMarksKit,
  ...ListKit,
  ...LinkKit,
  ImagePlugin.withComponent(ImageElement),
  CaptionPlugin.configure({
    options: { query: { allow: [KEYS.img] } },
  }),
  ...CodeBlockKit,
  ...TableKit,
  ...MentionKit,
  ...SlashKit,
  ...IndentKit,
  ...ToggleKit,
  ...EmojiKit,
  ...AutoformatKit,
  ExitBreakPlugin,
  TrailingBlockPlugin,
];

export interface EditorProps {
  className?: string;
  content?: string;
  onCancel?: () => void;
  onImageUpload?: (file: File) => Promise<{ url: string } | undefined>;
  onSave: (content: string) => void;
  placeholder?: string;
  saving?: boolean;
}

export function PlateEditor({
  content,
  onSave,
  onCancel,
  saving,
  onImageUpload,
  placeholder = "Write something...",
  className,
}: EditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = usePlateEditor({
    plugins: editorPlugins,
    value: content ? safeParse(content) : undefined,
  });

  async function handleImageUpload(file: File) {
    if (
      !ALLOWED_IMAGE_TYPES.includes(
        file.type as (typeof ALLOWED_IMAGE_TYPES)[number]
      )
    ) {
      toast.error("Only JPEG, PNG, GIF, and WebP images are allowed.");
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      toast.error(
        `Image must be smaller than ${Math.round(MAX_IMAGE_SIZE_BYTES / 1024 / 1024)} MB.`
      );
      return;
    }

    if (!onImageUpload) {
      toast.error("Image upload is not configured.");
      return;
    }

    try {
      const result = await onImageUpload(file);

      if (!result) {
        toast.error("Failed to upload image. Please try again.");
        return;
      }

      editor.tf.focus();

      if (!editor.selection) {
        editor.tf.select(editor.api.end([]));
      }

      const imageNode: TImageElement = {
        type: "img",
        url: result.url,
        children: [{ text: "" }],
      };
      editor.tf.insertNodes(imageNode);
    } catch (error) {
      log.error({
        component: "PlateEditor",
        action: "imageUpload",
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to upload image. Please try again.");
    }
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      await handleImageUpload(file);
    }
    e.target.value = "";
  }

  function handleSave() {
    const children = editor.children;
    if (!Array.isArray(children) || children.length === 0) {
      return;
    }
    onSave(JSON.stringify(children));
    editor.tf.reset();
  }

  const preventToolbarFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <div className={className}>
      <Plate editor={editor}>
        <div className="border focus-within:ring-1 focus-within:ring-ring">
          <FixedToolbar
            aria-label="Editor formatting"
            className="flex-wrap gap-0.5 border-x-0 border-t-0 p-1"
          >
            <ToolbarGroup>
              <UndoToolbarButton />
              <RedoToolbarButton />
            </ToolbarGroup>

            <ToolbarGroup>
              <InsertToolbarButton />
              <TurnIntoToolbarButton />
            </ToolbarGroup>

            <ToolbarGroup>
              <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
                <HugeiconsIcon icon={TextBoldIcon} />
              </MarkToolbarButton>
              <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
                <HugeiconsIcon icon={TextItalicIcon} />
              </MarkToolbarButton>
              <MarkToolbarButton
                nodeType={KEYS.underline}
                tooltip="Underline (⌘+U)"
              >
                <HugeiconsIcon icon={TextUnderlineIcon} />
              </MarkToolbarButton>
              <MarkToolbarButton
                nodeType={KEYS.strikethrough}
                tooltip="Strikethrough (⌘+⇧+M)"
              >
                <HugeiconsIcon icon={TextStrikethroughIcon} />
              </MarkToolbarButton>
              <MarkToolbarButton nodeType={KEYS.code} tooltip="Code (⌘+E)">
                <HugeiconsIcon icon={SourceCodeIcon} />
              </MarkToolbarButton>
            </ToolbarGroup>

            <ToolbarGroup>
              <ListToolbarButton nodeType={KEYS.ulClassic} />
              <ListToolbarButton nodeType={KEYS.olClassic} />
              <ToggleToolbarButton />
            </ToolbarGroup>

            <ToolbarGroup>
              <LinkToolbarButton />
              <TableToolbarButton />
              <EmojiToolbarButton />
              {onImageUpload && (
                <>
                  <ToolbarButton
                    onClick={() => fileInputRef.current?.click()}
                    onMouseDown={preventToolbarFocus}
                    tooltip="Upload image"
                  >
                    <HugeiconsIcon icon={Image01Icon} />
                  </ToolbarButton>
                  <input
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    onChange={handleFileChange}
                    ref={fileInputRef}
                    type="file"
                  />
                </>
              )}
            </ToolbarGroup>

            <ToolbarGroup>
              <OutdentToolbarButton />
              <IndentToolbarButton />
            </ToolbarGroup>
          </FixedToolbar>

          <EditorContainer className="min-h-64">
            <Editor
              className="px-6 py-3 text-base"
              placeholder={placeholder}
              variant="none"
            />
          </EditorContainer>
        </div>

        <SaveBar onCancel={onCancel} onSave={handleSave} saving={saving} />
      </Plate>
    </div>
  );
}

function SaveBar({
  onCancel,
  onSave,
  saving,
}: {
  onCancel?: () => void;
  onSave: () => void;
  saving?: boolean;
}) {
  const empty = useEditorSelector((editor) => editor.api.isEmpty(), []);

  return (
    <div className="mt-2 flex gap-2">
      <Button
        disabled={saving || empty}
        onClick={onSave}
        size="sm"
        type="button"
      >
        {saving ? "Saving…" : "Save"}
      </Button>
      {onCancel && (
        <Button
          disabled={saving}
          onClick={onCancel}
          size="sm"
          type="button"
          variant="ghost"
        >
          Cancel
        </Button>
      )}
    </div>
  );
}
