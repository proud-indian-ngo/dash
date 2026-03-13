'use client';

import { BulletedListPlugin, NumberedListPlugin } from '@platejs/list-classic/react';
import { useEditorRef, useEditorSelector } from 'platejs/react';

import { ToolbarButton } from './toolbar';

export function BulletedListToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const editor = useEditorRef();
  const pressed = useEditorSelector(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- platejs types not resolvable in design-system
    (e: any) =>
      e.api.some({
        match: { type: BulletedListPlugin.node.type },
      }),
    []
  );

  return (
    <ToolbarButton
      {...props}
      pressed={pressed}
      onClick={() => (editor as any).tf.ul.toggle()}
      onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
    />
  );
}

export function NumberedListToolbarButton(
  props: React.ComponentProps<typeof ToolbarButton>
) {
  const editor = useEditorRef();
  const pressed = useEditorSelector(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- platejs types not resolvable in design-system
    (e: any) =>
      e.api.some({
        match: { type: NumberedListPlugin.node.type },
      }),
    []
  );

  return (
    <ToolbarButton
      {...props}
      pressed={pressed}
      onClick={() => (editor as any).tf.ol.toggle()}
      onMouseDown={(e: React.MouseEvent) => e.preventDefault()}
    />
  );
}
