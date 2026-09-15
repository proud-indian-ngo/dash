import { mkdir } from "node:fs/promises";

import { generateKalakritiIdCards } from "../packages/pdf/src/generate-kalakriti-id-cards";

const output = process.argv[2] ?? "output/pdf/kalakriti-id-cards.pdf";
const pdf = await generateKalakritiIdCards([
  {
    id: "01900000-0000-7000-8000-000000000001",
    type: "student",
    name: "Aarav Sharma",
    centerName: "Sunshine Learning Centre",
    competitions: [
      { name: "Drawing", startsAt: Date.parse("2027-01-01T09:30:00+05:30") },
      {
        name: "Solo Singing",
        startsAt: Date.parse("2027-01-01T11:15:00+05:30"),
      },
      {
        name: "Group Dance",
        startsAt: Date.parse("2027-01-01T14:00:00+05:30"),
      },
    ],
  },
  {
    id: "01900000-0000-7000-8000-000000000002",
    type: "volunteer",
    name: "Meera Nair",
    role: "Stage Coordinator",
  },
  {
    id: "01900000-0000-7000-8000-000000000003",
    type: "guardian",
    name: "Kavitha Rao",
    centerName: "Sunshine Learning Centre",
  },
  {
    id: "01900000-0000-7000-8000-000000000004",
    type: "judge",
    name: "Arjun Menon",
  },
  {
    id: "01900000-0000-7000-8000-000000000005",
    type: "guest",
    name: "Ananya Iyer",
  },
]);
await mkdir(new URL("../output/pdf/", import.meta.url), { recursive: true });
await Bun.write(output, pdf);
console.log(output);
