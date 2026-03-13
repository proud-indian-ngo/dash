import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

interface TiptapRendererProps {
  content: string;
}

export function TiptapRenderer({ content }: TiptapRendererProps) {
  let parsed: Record<string, unknown> | undefined;
  try {
    parsed = JSON.parse(content);
  } catch {
    // fallback handled below
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({ openOnClick: true }),
      Image.configure({ inline: false }),
    ],
    content: parsed,
    editable: false,
  });

  if (!(editor && parsed)) {
    return (
      <p className="text-muted-foreground text-sm">
        Unable to display this update.
      </p>
    );
  }

  return <EditorContent className="prose prose-sm" editor={editor} />;
}
