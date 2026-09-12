import { beforeEach, describe, expect, it, mock } from "bun:test";

import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const actualReact = await import("react");
let cursor = 0;
let slots: any[] = [];
let dialog: any;
let content: any;
let toggle: any;
let scan: any;
let note: any;
const closed: boolean[] = [];
mock.module("react", () => ({
  ...actualReact,
  useState: (initial: any) => {
    const index = cursor++;
    if (!(index in slots))
      slots[index] = typeof initial === "function" ? initial() : initial;
    return [
      slots[index],
      (value: any) => {
        slots[index] =
          typeof value === "function" ? value(slots[index]) : value;
      },
    ];
  },
  useRef: (initial: any) => {
    const index = cursor++;
    if (!(index in slots)) slots[index] = { current: initial };
    return slots[index];
  },
}));
mock.module("@pi-dash/design-system/hooks/use-event-callback", () => ({
  useEventCallback: (callback: any) => callback,
}));
const pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
mock.module("@pi-dash/design-system/components/ui/button", () => ({
  Button: (props: any) => {
    toggle = props;
    return <button type="button">{props.children}</button>;
  },
}));
mock.module("@pi-dash/design-system/components/ui/dialog", () => ({
  Dialog: (props: any) => {
    dialog = props;
    return pass(props);
  },
  DialogContent: (props: any) => {
    content = props;
    return pass(props);
  },
  DialogHeader: pass,
  DialogTitle: pass,
  DialogDescription: pass,
}));
mock.module("@pi-dash/design-system/components/ui/tabs", () => ({
  Tabs: pass,
  TabsContent: pass,
  TabsList: pass,
  TabsTrigger: pass,
}));
mock.module("./center-scan-dialog", () => ({
  CenterScanPanel: (props: any) => {
    scan = props;
    return <p>Retained scanning panel</p>;
  },
}));
mock.module("./operation-scan-panel", () => ({
  OperationScanPanel: () => null,
}));
mock.module("./operation-note-panel", () => ({
  OperationNotePanel: (props: any) => {
    note = props;
    return <p>Notes panel</p>;
  },
}));
const { ScanDialog } = await import("./scan-dialog");
function render() {
  cursor = 0;
  return renderToStaticMarkup(
    <ScanDialog
      editionId="edition"
      year={2026}
      activities={["transport"]}
      canAddNote
      onOpenChange={(open) => closed.push(open)}
    />
  );
}
beforeEach(() => {
  slots = [];
  closed.length = 0;
});
describe("Scan and correction busy ownership", () => {
  for (const operation of ["lookup", "submission"]) {
    it(`keeps closure and switching locked when hidden Scan clears busy during a note ${operation}`, () => {
      render();
      toggle.onClick();
      const html = render();
      expect(html).toContain("Notes panel");
      expect(html).toContain("Retained scanning panel");
      expect(html).toContain('hidden=""');
      expect(html).toContain('inert=""');
      note.onBusyChange(true);
      scan.onBusyChange(false);
      dialog.onOpenChange(false);
      scan.onComplete();
      toggle.onClick();
      expect(closed).toEqual([]);
      expect(render()).toContain("Notes panel");
      expect(content.showCloseButton).toBe(false);
      expect(toggle.disabled).toBe(true);
      note.onBusyChange(false);
      render();
      scan.onComplete();
      expect(closed).toEqual([]);
      dialog.onOpenChange(false);
      expect(closed).toEqual([false]);
    });
  }
  it("does not let a note cleanup clear a still-busy Scan producer", () => {
    render();
    toggle.onClick();
    render();
    scan.onBusyChange(true);
    note.onBusyChange(false);
    dialog.onOpenChange(false);
    expect(closed).toEqual([]);
    render();
    expect(content.showCloseButton).toBe(false);
    scan.onBusyChange(false);
    dialog.onOpenChange(false);
    expect(closed).toEqual([false]);
  });
});
