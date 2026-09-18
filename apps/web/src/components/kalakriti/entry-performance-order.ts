import {
  compareKalakritiPerformanceOrder,
  getKalakritiEntryNextSlot,
  indexKalakritiNextSlotsByStudent,
  type KalakritiEntryNextSlot,
  type KalakritiStudentNextSlot,
} from "@pi-dash/shared/kalakriti-performance-order";

import type { KalakritiEntryRow } from "./entry-form-dialog";

export function orderSequentialKalakritiEntries(
  entries: readonly KalakritiEntryRow[],
  currentEndAt: number,
  slots: readonly KalakritiStudentNextSlot[]
): {
  entries: KalakritiEntryRow[];
  nextByEntryId: Map<string, KalakritiEntryNextSlot>;
} {
  const slotsByStudent = indexKalakritiNextSlotsByStudent(slots);
  const nextByEntryId = new Map<string, KalakritiEntryNextSlot>();
  const decorated = entries.map((entry) => {
    const nextSlot = getKalakritiEntryNextSlot({
      currentEndAt,
      members: entry.members.map((member) => ({
        name: member.student.name,
        studentId: member.studentId,
      })),
      slotsByStudent,
    });
    nextByEntryId.set(entry.id, nextSlot);
    return {
      centerName: entry.center?.name ?? "",
      entry,
      nextStartAt: nextSlot.startAt,
      sortName: entry.members.map((member) => member.student.name).join(" "),
    };
  });
  decorated.sort((left, right) =>
    compareKalakritiPerformanceOrder(left, right)
  );
  return {
    entries: decorated.map((row) => row.entry),
    nextByEntryId,
  };
}

export function formatKalakritiNextSlotLabel(
  slot: KalakritiEntryNextSlot,
  timeLabel: string,
  group: boolean
): string {
  if (slot.kind === "none" || !slot.competitionName || !slot.venueName) {
    return "—";
  }
  const detail = `${slot.competitionName} · ${timeLabel} · ${slot.venueName}`;
  const named =
    group && slot.studentName ? `${slot.studentName} · ${detail}` : detail;
  if (group && slot.memberCount > 1) {
    return `${named} · +${slot.memberCount - 1} more`;
  }
  return named;
}
