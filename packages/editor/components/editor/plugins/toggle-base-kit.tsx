import { BaseIndentKit } from "./indent-base-kit";
import {
  ToggleContentStatic,
  ToggleElementStatic,
} from "../../ui/toggle-node-static";
import { BaseTogglePlugin } from "@platejs/toggle";

export const BaseToggleKit = [
  ...BaseIndentKit,
  BaseTogglePlugin.extend({
    render: {
      // Static rendering calls this as a function, so wrap it in an element
      // to give the component its own hooks.
      aboveNodes: () => (props) => <ToggleContentStatic {...props} />,
    },
  }).withComponent(ToggleElementStatic),
];
