import { Button } from "@pi-dash/design-system/components/ui/button";
import { env } from "@pi-dash/env/web";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
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

function safeParse(json: string): Record<string, unknown> | undefined {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

const TRAILING_SLASH = /\/$/;
function getCdnUrl(key: string): string {
  return `${env.VITE_ASSET_CDN.replace(TRAILING_SLASH, "")}/${key}`;
}

interface TiptapEditorProps {
  content?: string;
  onCancel?: () => void;
  onSave: (content: string) => void;
  saving?: boolean;
}

export function TiptapEditor({
  content,
  onCancel,
  onSave,
  saving,
}: TiptapEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: false }),
      Image.configure({ inline: false }),
    ],
    content: content ? safeParse(content) : undefined,
  });

  async function handleImageUpload(file: File) {
    if (!editor) {
      return;
    }

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

      await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      editor
        .chain()
        .focus()
        .setImage({ src: getCdnUrl(key) })
        .run();
    } catch {
      toast.error("Failed to upload image. Please try again.");
    }
  }

  function handleImageButtonClick() {
    fileInputRef.current?.click();
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      await handleImageUpload(file);
    }
    e.target.value = "";
  }

  function handleSave() {
    if (!editor) {
      return;
    }
    onSave(JSON.stringify(editor.getJSON()));
  }

  if (!editor) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        <Button
          disabled={!editor.can().chain().focus().toggleBold().run()}
          onClick={() => editor.chain().focus().toggleBold().run()}
          size="sm"
          type="button"
          variant={editor.isActive("bold") ? "secondary" : "ghost"}
        >
          Bold
        </Button>
        <Button
          disabled={!editor.can().chain().focus().toggleItalic().run()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          size="sm"
          type="button"
          variant={editor.isActive("italic") ? "secondary" : "ghost"}
        >
          Italic
        </Button>
        <Button
          disabled={!editor.can().chain().focus().toggleBulletList().run()}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          size="sm"
          type="button"
          variant={editor.isActive("bulletList") ? "secondary" : "ghost"}
        >
          List
        </Button>
        <Button
          onClick={handleImageButtonClick}
          size="sm"
          type="button"
          variant="ghost"
        >
          Image
        </Button>
        <input
          accept="image/jpeg,image/png,image/gif,image/webp"
          className="hidden"
          onChange={handleFileChange}
          ref={fileInputRef}
          type="file"
        />
      </div>

      <EditorContent
        className="prose prose-sm min-h-[120px] rounded-md border p-3 focus-within:ring-1 focus-within:ring-ring"
        editor={editor}
      />

      <div className="flex gap-2">
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
