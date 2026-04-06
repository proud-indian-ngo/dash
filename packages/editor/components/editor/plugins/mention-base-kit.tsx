import { MentionElementStatic } from "@pi-dash/editor/components/ui/mention-node-static";
import { BaseMentionPlugin } from "@platejs/mention";

export const BaseMentionKit = [
  BaseMentionPlugin.withComponent(MentionElementStatic),
];
