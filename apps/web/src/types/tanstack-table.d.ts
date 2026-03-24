import "@tanstack/react-table";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnDefBase<TData, TValue> {
    /** Controls whether a column can be reordered via drag-and-drop. Defaults to true. */
    enableColumnOrdering?: boolean;
  }
}
