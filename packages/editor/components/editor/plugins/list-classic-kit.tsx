"use client";

import {
  BulletedListElement,
  ListItemElement,
  NumberedListElement,
  TaskListElement,
} from "../../ui/list-classic-node";
import {
  BulletedListRules,
  OrderedListRules,
  TaskListRules,
} from "@platejs/list-classic";
import {
  BulletedListPlugin,
  ListItemContentPlugin,
  ListItemPlugin,
  ListPlugin,
  NumberedListPlugin,
  TaskListPlugin,
} from "@platejs/list-classic/react";

export const ListKit = [
  ListPlugin,
  ListItemPlugin,
  ListItemContentPlugin,
  BulletedListPlugin.configure({
    node: { component: BulletedListElement },
    inputRules: [
      BulletedListRules.markdown({ variant: "*" }),
      BulletedListRules.markdown({ variant: "-" }),
    ],
    shortcuts: { toggle: { keys: "mod+alt+5" } },
  }),
  NumberedListPlugin.configure({
    node: { component: NumberedListElement },
    inputRules: [
      OrderedListRules.markdown({ variant: "." }),
      OrderedListRules.markdown({ variant: ")" }),
    ],
    shortcuts: { toggle: { keys: "mod+alt+6" } },
  }),
  TaskListPlugin.configure({
    node: { component: TaskListElement },
    inputRules: [
      TaskListRules.markdown({ checked: false }),
      TaskListRules.markdown({ checked: true }),
    ],
    shortcuts: { toggle: { keys: "mod+alt+7" } },
  }),
  ListItemPlugin.withComponent(ListItemElement),
];
