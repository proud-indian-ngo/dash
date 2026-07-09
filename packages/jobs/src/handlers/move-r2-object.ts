import type { MoveR2ObjectPayload } from "../enqueue";
import { moveR2Object } from "../r2-object";
import { createNotifyHandler } from "./create-handler";

export const handleMoveR2Object = createNotifyHandler<MoveR2ObjectPayload>(
  "move-r2-object",
  async () => moveR2Object
);
