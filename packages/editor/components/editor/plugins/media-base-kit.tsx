import { ImageElementStatic } from "../../ui/media-image-node-static";
import { BaseImagePlugin } from "@platejs/media";

export const BaseMediaKit = [BaseImagePlugin.withComponent(ImageElementStatic)];
