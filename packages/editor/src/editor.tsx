"use client";

import {
  ImageUpload01Icon,
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { ALLOWED_IMAGE_TYPES } from "@pi-dash/shared/constants";
import { CaptionPlugin } from "@platejs/caption/react";
import { ImagePlugin } from "@platejs/media/react";
import { log } from "evlog";
import type { TImageElement, Value } from "platejs";
import { KEYS } from "platejs";
import { Plate, usePlateEditor } from "platejs/react";
import { type ChangeEvent, type MouseEvent, useEffect, useRef } from "react";
import { toast } from "sonner";
import { AutoformatKit } from "../components/editor/plugins/autoformat-classic-kit";
import { BasicBlocksKit } from "../components/editor/plugins/basic-blocks-kit";
import { BasicMarksKit } from "../components/editor/plugins/basic-marks-kit";
import { CodeBlockKit } from "../components/editor/plugins/code-block-kit";
import { DndKit } from "../components/editor/plugins/dnd-kit";
import { EmojiKit } from "../components/editor/plugins/emoji-kit";
import { IndentKit } from "../components/editor/plugins/indent-kit";
import { LinkKit } from "../components/editor/plugins/link-kit";
import { ListKit } from "../components/editor/plugins/list-classic-kit";
import { MentionKit } from "../components/editor/plugins/mention-kit";
import { SlashKit } from "../components/editor/plugins/slash-kit";
import { TableKit } from "../components/editor/plugins/table-kit";
import { ToggleKit } from "../components/editor/plugins/toggle-kit";
import {
  BlockquoteToolbarButton,
  CodeBlockToolbarButton,
  H1ToolbarButton,
  H2ToolbarButton,
  H3ToolbarButton,
} from "../components/ui/block-type-toolbar-button";
import { Editor, EditorContainer } from "../components/ui/editor";
import { EmojiToolbarButton } from "../components/ui/emoji-toolbar-button";
import { FixedToolbar } from "../components/ui/fixed-toolbar";
import {
  IndentToolbarButton,
  OutdentToolbarButton,
} from "../components/ui/indent-toolbar-button";
import { LinkToolbarButton } from "../components/ui/link-toolbar-button";
import { ListToolbarButton } from "../components/ui/list-classic-toolbar-button";
import { MarkToolbarButton } from "../components/ui/mark-toolbar-button";
import { ImageElement } from "../components/ui/media-image-node";
import { TableToolbarButton } from "../components/ui/table-toolbar-button";
import { ToggleToolbarButton } from "../components/ui/toggle-toolbar-button";
import {
  ToolbarButton,
  ToolbarGroup,
  ToolbarSeparator,
} from "../components/ui/toolbar";

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

function safeParse(json: string): Value | undefined {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
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
  ...DndKit,
  ...IndentKit,
  ...ToggleKit,
  ...EmojiKit,
  ...AutoformatKit,
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
  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

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
      toast.error("Image must be smaller than 10 MB.");
      return;
    }

    if (!onImageUpload) {
      toast.error("Image upload is not configured.");
      return;
    }

    try {
      const result = await onImageUpload(file);

      if (!mountedRef.current) {
        return;
      }

      if (!result) {
        toast.error("Failed to upload image. Please try again.");
        return;
      }

      editor.tf.focus();

      const imageNode: TImageElement = {
        type: "img",
        url: result.url,
        children: [{ text: "" }],
      };
      editor.tf.insertNodes(imageNode);
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
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
  }

  const preventToolbarFocus = (e: MouseEvent) => e.preventDefault();

  return (
    <div className={className}>
      <Plate editor={editor}>
        <div className="rounded-md border focus-within:ring-1 focus-within:ring-ring">
          <FixedToolbar
            aria-label="Editor formatting"
            className="flex-wrap gap-0.5 border-x-0 border-t-0 p-1"
          >
            <ToolbarGroup>
              <H1ToolbarButton />
              <H2ToolbarButton />
              <H3ToolbarButton />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
              <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘B)">
                <HugeiconsIcon icon={TextBoldIcon} size={16} />
              </MarkToolbarButton>
              <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘I)">
                <HugeiconsIcon icon={TextItalicIcon} size={16} />
              </MarkToolbarButton>
              <MarkToolbarButton
                nodeType={KEYS.underline}
                tooltip="Underline (⌘U)"
              >
                <HugeiconsIcon icon={TextUnderlineIcon} size={16} />
              </MarkToolbarButton>
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
              <ListToolbarButton nodeType={KEYS.ulClassic} />
              <ListToolbarButton nodeType={KEYS.olClassic} />
              <ToggleToolbarButton />
              <BlockquoteToolbarButton />
              <CodeBlockToolbarButton />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
              <LinkToolbarButton />
              {onImageUpload && (
                <>
                  <ToolbarButton
                    onClick={() => fileInputRef.current?.click()}
                    onMouseDown={preventToolbarFocus}
                    tooltip="Upload image"
                  >
                    <HugeiconsIcon icon={ImageUpload01Icon} size={16} />
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

            <ToolbarSeparator />

            <ToolbarGroup>
              <TableToolbarButton />
              <EmojiToolbarButton />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
              <OutdentToolbarButton />
              <IndentToolbarButton />
            </ToolbarGroup>
          </FixedToolbar>

          <EditorContainer className="min-h-64">
            <Editor placeholder={placeholder} />
          </EditorContainer>
        </div>
      </Plate>

      <div className="mt-2 flex gap-2">
        <Button disabled={saving} onClick={handleSave} size="sm" type="button">
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
    </div>
  );
}
