import {
  BulletedListElementStatic,
  ListItemElementStatic,
  NumberedListElementStatic,
  TaskListElementStatic,
} from "../../ui/list-classic-node-static";
import {
  BaseBulletedListPlugin,
  BaseListItemContentPlugin,
  BaseListItemPlugin,
  BaseListPlugin,
  BaseNumberedListPlugin,
  BaseTaskListPlugin,
} from "@platejs/list-classic";

export const BaseListKit = [
  BaseListPlugin,
  BaseListItemContentPlugin,
  BaseBulletedListPlugin.withComponent(BulletedListElementStatic),
  BaseNumberedListPlugin.withComponent(NumberedListElementStatic),
  BaseTaskListPlugin.withComponent(TaskListElementStatic),
  BaseListItemPlugin.withComponent(ListItemElementStatic),
];
