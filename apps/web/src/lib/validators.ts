import z from "zod";

export const optionalDate = z.union([z.date(), z.undefined()]);
