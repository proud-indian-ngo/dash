import path from "node:path";

const directory = path.resolve(import.meta.dirname, "../assets");

export const kalakritiIdCardAssets = {
  proudIndian: path.join(directory, "proud-indian-id.png"),
  kalakriti: path.join(directory, "kalakriti.png"),
  regularFont: path.join(directory, "fonts/PlusJakartaSans-Regular.ttf"),
  boldFont: path.join(directory, "fonts/PlusJakartaSans-Bold.ttf"),
};
