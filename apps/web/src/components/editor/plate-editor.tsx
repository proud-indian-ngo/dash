import {
  ImageUpload01Icon,
  LeftToRightBlockQuoteIcon,
  LeftToRightListBulletIcon,
  LeftToRightListNumberIcon,
  Link01Icon,
  TextBoldIcon,
  TextItalicIcon,
  TextUnderlineIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BlockquoteElement } from "@pi-dash/design-system/components/ui/blockquote-node";
import { Button } from "@pi-dash/design-system/components/ui/button";
import { FixedToolbar } from "@pi-dash/design-system/components/ui/fixed-toolbar";
import { LinkElement } from "@pi-dash/design-system/components/ui/link-node";
import { LinkFloatingToolbar } from "@pi-dash/design-system/components/ui/link-toolbar";
import {
  BulletedListElement,
  ListItemElement,
  NumberedListElement,
} from "@pi-dash/design-system/components/ui/list-classic-node";
import {
  BulletedListToolbarButton,
  NumberedListToolbarButton,
} from "@pi-dash/design-system/components/ui/list-toolbar-button";
import { MarkToolbarButton } from "@pi-dash/design-system/components/ui/mark-toolbar-button";
import { ImageElement } from "@pi-dash/design-system/components/ui/media-image-node";
import {
  ToolbarButton,
  ToolbarGroup,
} from "@pi-dash/design-system/components/ui/toolbar";
import { env } from "@pi-dash/env/web";
import {
  BlockquotePlugin,
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
} from "@platejs/basic-nodes/react";
import { CaptionPlugin } from "@platejs/caption/react";
import { LinkPlugin, triggerFloatingLink } from "@platejs/link/react";
import {
  BulletedListPlugin,
  ListItemContentPlugin,
  ListItemPlugin,
  ListPlugin,
  NumberedListPlugin,
} from "@platejs/list-classic/react";
import { ImagePlugin } from "@platejs/media/react";
import type { TImageElement, Value } from "platejs";
import { KEYS } from "platejs";
import { Plate, PlateContent, usePlateEditor } from "platejs/react";
import { useRef } from "react";
import { toast } from "sonner";
import { getPresignedUploadUrl } from "@/functions/attachments";

const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

function safeParse(json: string): Value | undefined {
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

const TRAILING_SLASH = /\/$/;
function getCdnUrl(key: string): string {
  return `${env.VITE_CDN_URL.replace(TRAILING_SLASH, "")}/${key}`;
}

export const ListKit = [
  ListPlugin,
  ListItemContentPlugin,
  BulletedListPlugin.configure({
    node: { component: BulletedListElement },
  }),
  NumberedListPlugin.configure({
    node: { component: NumberedListElement },
  }),
  ListItemPlugin.withComponent(ListItemElement),
];

const plugins = [
  BoldPlugin,
  ItalicPlugin,
  UnderlinePlugin,
  BlockquotePlugin.configure({
    node: { component: BlockquoteElement },
  }),
  LinkPlugin.configure({
    render: {
      node: LinkElement,
      afterEditable: () => <LinkFloatingToolbar />,
    },
  }),
  ...ListKit,
  ImagePlugin.withComponent(ImageElement),
  CaptionPlugin.configure({
    options: { query: { allow: [KEYS.img] } },
  }),
];

interface PlateEditorProps {
  content?: string;
  onCancel?: () => void;
  onSave: (content: string) => void;
  saving?: boolean;
}

export function PlateEditor({
  content,
  onCancel,
  onSave,
  saving,
}: PlateEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = usePlateEditor({
    plugins,
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

    try {
      const { key, presignedUrl } = await getPresignedUploadUrl({
        data: {
          fileName: file.name,
          fileSize: file.size,
          mimeType: file.type as (typeof ALLOWED_IMAGE_TYPES)[number],
        },
      });

      const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!uploadRes.ok) {
        throw new Error("Upload failed");
      }

      editor.tf.focus();

      const imageNode: TImageElement = {
        type: "img",
        url: getCdnUrl(key),
        children: [{ text: "" }],
      };
      editor.tf.insertNodes(imageNode);
    } catch {
      toast.error("Failed to upload image. Please try again.");
    }
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      await handleImageUpload(file);
    }
    e.target.value = "";
  }

  function handleSave() {
    onSave(JSON.stringify(editor.children));
  }

  const preventFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div className="space-y-2">
      <Plate editor={editor}>
        <div className="rounded-md border focus-within:ring-1 focus-within:ring-ring">
          <FixedToolbar
            aria-label="Editor formatting"
            className="border-x-0 border-t-0"
          >
            <ToolbarGroup>
              <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold">
                <HugeiconsIcon icon={TextBoldIcon} />
              </MarkToolbarButton>
              <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic">
                <HugeiconsIcon icon={TextItalicIcon} />
              </MarkToolbarButton>
              <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline">
                <HugeiconsIcon icon={TextUnderlineIcon} />
              </MarkToolbarButton>
            </ToolbarGroup>

            <ToolbarGroup>
              <BulletedListToolbarButton tooltip="Bullet list">
                <HugeiconsIcon icon={LeftToRightListBulletIcon} />
              </BulletedListToolbarButton>
              <NumberedListToolbarButton tooltip="Numbered list">
                <HugeiconsIcon icon={LeftToRightListNumberIcon} />
              </NumberedListToolbarButton>
              <ToolbarButton
                onClick={() => editor.tf.blockquote.toggle()}
                onMouseDown={preventFocus}
                tooltip="Blockquote"
              >
                <HugeiconsIcon icon={LeftToRightBlockQuoteIcon} />
              </ToolbarButton>
            </ToolbarGroup>

            <ToolbarGroup>
              <ToolbarButton
                onClick={() => triggerFloatingLink(editor, { focused: true })}
                onMouseDown={preventFocus}
                tooltip="Link"
              >
                <HugeiconsIcon icon={Link01Icon} />
              </ToolbarButton>
              <ToolbarButton
                onClick={() => fileInputRef.current?.click()}
                onMouseDown={preventFocus}
                tooltip="Upload image"
              >
                <HugeiconsIcon icon={ImageUpload01Icon} />
              </ToolbarButton>
              <input
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleFileChange}
                ref={fileInputRef}
                type="file"
              />
            </ToolbarGroup>
          </FixedToolbar>

          <PlateContent
            className="prose prose-sm p-3 outline-none"
            placeholder="Write something..."
            style={{ minHeight: 128 }}
          />
        </div>
      </Plate>

      <div className="flex gap-2">
        <Button disabled={saving} onClick={handleSave} size="sm" type="button">
          {saving ? "Saving\u2026" : "Save"}
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
