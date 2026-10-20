import { Button } from "./button";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { BaseTogglePlugin } from "@platejs/toggle";
import { buildToggleIndex } from "@platejs/toggle/react";
import { useStoreValue } from "platejs/react";
import type {
  SlateElementProps,
  SlateRenderElementProps,
} from "platejs/static";
import { SlateElement } from "platejs/static";

// Read-only stand-in for TogglePlugin's open state: toggles start closed and
// open on click, with the state kept in the static editor's plugin options.
const noOpenToggles: ReadonlySet<string> = new Set();

function useOpenToggleIds(editor: SlateElementProps["editor"]) {
  return (
    useStoreValue(editor.getOptionsStore(BaseTogglePlugin), "openIds") ??
    noOpenToggles
  );
}

export function ToggleElementStatic(props: SlateElementProps) {
  const { editor, element } = props;
  const toggleId = element.id as string;
  const open = useOpenToggleIds(editor).has(toggleId);

  return (
    <SlateElement {...props} className="pl-6">
      <Button
        className="absolute top-0 -left-0.5 size-6 cursor-pointer select-none items-center justify-center rounded-none p-px text-muted-foreground transition-colors hover:bg-accent [&_svg]:size-4"
        contentEditable={false}
        onClick={() =>
          editor.getApi(BaseTogglePlugin).toggle.toggleIds([toggleId])
        }
        size="icon"
        variant="ghost"
      >
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          className={
            open
              ? "rotate-90 transition-transform duration-75"
              : "rotate-0 transition-transform duration-75"
          }
        />
      </Button>
      {props.children}
    </SlateElement>
  );
}

const hiddenStyle = {
  height: 0,
  margin: 0,
  overflow: "hidden",
  visibility: "hidden",
} as const;

// Hides the blocks a closed toggle encloses, as TogglePlugin does in the editor.
export function ToggleContentStatic({
  children,
  editor,
  element,
}: SlateRenderElementProps) {
  const openIds = useOpenToggleIds(editor);
  const enclosingToggleIds =
    buildToggleIndex(editor.children).get(element.id as string) ?? [];

  if (enclosingToggleIds.every((toggleId) => openIds.has(toggleId))) {
    return children;
  }
  return <div style={hiddenStyle}>{children}</div>;
}
