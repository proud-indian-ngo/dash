export interface ComplianceStudent {
  centerId: string;
  entryMemberships: readonly { id: string }[];
  humanId: string;
  id: string;
  name: string;
}

export interface ParticipationCompliance {
  issues: { id: string; humanId: string; name: string; count: number }[];
  minimum: number;
  students: number;
}

/** Memberships count individual and group participation just like the closing rule. */
export function buildParticipationCompliance(
  students: readonly ComplianceStudent[],
  minimum: number
): Map<string, ParticipationCompliance> {
  const centers = new Map<string, ParticipationCompliance>();
  for (const student of students) {
    const count = student.entryMemberships.length;
    let compliance = centers.get(student.centerId);
    if (!compliance) {
      compliance = { issues: [], minimum, students: 0 };
      centers.set(student.centerId, compliance);
    }
    compliance.students += 1;
    if (count < minimum) {
      compliance.issues.push({
        count,
        humanId: student.humanId,
        id: student.id,
        name: student.name,
      });
    }
  }
  return centers;
}
