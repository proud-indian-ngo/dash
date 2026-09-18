export interface KalakritiStudentNextSlot {
  competitionName: string;
  startAt: number;
  studentId: string;
  venueName: string;
}

export type KalakritiNextSlotKind = "immediate" | "later" | "none";

export interface KalakritiEntryNextSlot {
  competitionName: string | null;
  kind: KalakritiNextSlotKind;
  memberCount: number;
  startAt: number | null;
  studentName: string | null;
  venueName: string | null;
}

const NONE_SLOT: KalakritiEntryNextSlot = {
  competitionName: null,
  kind: "none",
  memberCount: 0,
  startAt: null,
  studentName: null,
  venueName: null,
};

export function pickSoonestKalakritiNextSlot(
  currentEndAt: number,
  slots: readonly KalakritiStudentNextSlot[]
): KalakritiStudentNextSlot | null {
  let soonest: KalakritiStudentNextSlot | null = null;
  for (const slot of slots) {
    if (slot.startAt < currentEndAt) continue;
    if (!soonest || slot.startAt < soonest.startAt) soonest = slot;
  }
  return soonest;
}

export function getKalakritiEntryNextSlot({
  currentEndAt,
  members,
  slotsByStudent,
}: {
  currentEndAt: number;
  members: readonly { studentId: string; name: string }[];
  slotsByStudent: ReadonlyMap<string, KalakritiStudentNextSlot>;
}): KalakritiEntryNextSlot {
  const seen = new Set<string>();
  let soonest: {
    slot: KalakritiStudentNextSlot;
    studentName: string;
  } | null = null;
  let memberCount = 0;
  for (const member of members) {
    if (seen.has(member.studentId)) continue;
    seen.add(member.studentId);
    const slot = slotsByStudent.get(member.studentId);
    if (!slot || slot.startAt < currentEndAt) continue;
    memberCount += 1;
    if (!soonest || slot.startAt < soonest.slot.startAt) {
      soonest = { slot, studentName: member.name };
    }
  }
  if (!soonest) return NONE_SLOT;
  return {
    competitionName: soonest.slot.competitionName,
    kind: soonest.slot.startAt === currentEndAt ? "immediate" : "later",
    memberCount,
    startAt: soonest.slot.startAt,
    studentName: soonest.studentName,
    venueName: soonest.slot.venueName,
  };
}

export function compareKalakritiPerformanceOrder(
  left: { centerName: string; nextStartAt: number | null; sortName: string },
  right: { centerName: string; nextStartAt: number | null; sortName: string }
): number {
  if (left.nextStartAt === null && right.nextStartAt === null) {
    return (
      left.sortName.localeCompare(right.sortName, "en", {
        sensitivity: "base",
      }) ||
      left.centerName.localeCompare(right.centerName, "en", {
        sensitivity: "base",
      })
    );
  }
  if (left.nextStartAt === null) return 1;
  if (right.nextStartAt === null) return -1;
  return (
    left.nextStartAt - right.nextStartAt ||
    left.sortName.localeCompare(right.sortName, "en", {
      sensitivity: "base",
    }) ||
    left.centerName.localeCompare(right.centerName, "en", {
      sensitivity: "base",
    })
  );
}

export function indexKalakritiNextSlotsByStudent(
  slots: readonly KalakritiStudentNextSlot[]
): Map<string, KalakritiStudentNextSlot> {
  const byStudent = new Map<string, KalakritiStudentNextSlot>();
  for (const slot of slots) {
    const existing = byStudent.get(slot.studentId);
    if (!existing || slot.startAt < existing.startAt) {
      byStudent.set(slot.studentId, slot);
    }
  }
  return byStudent;
}
