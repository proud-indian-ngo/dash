import {
  getEntryStudentOptionEligibility,
  indexEntriesByStudent,
} from "../src/lib/kalakriti-entry-policy";
const session = {
  id: "target",
  ageCategoryId: "age",
  ageCategory: { name: "Junior" },
  competition: {
    category: { name: "Arts" },
    competitionCategoryId: "arts",
    genderEligibility: "both" as const,
    maximumGroupSize: 10,
    minimumGroupSize: 2,
    participationMode: "individual" as const,
  },
  startAt: 100,
  endAt: 200,
};
const students = Array.from({ length: 1500 }, (_, i) => ({
  id: `student-${i}`,
  ageCategoryId: "age",
  ageCategory: { maxTotalCompetitions: 30, maxCompetitionsPerCategory: 30 },
  gender: "female" as const,
}));
const entries = Array.from({ length: 3000 }, (_, i) => ({
  id: `entry-${i}`,
  sessionId: `session-${Math.floor(i / 100)}`,
  session: {
    ...session,
    id: `session-${Math.floor(i / 100)}`,
    startAt: 300,
    endAt: 400,
  },
  members: [{ studentId: students[i % students.length]!.id }],
}));
for (const size of [150, 1500]) {
  for (const indexed of [false, true]) {
    const samples = [];
    let eligible = 0;
    for (let iteration = 0; iteration < 6; iteration++) {
      const start = performance.now();
      const byStudent = indexed ? indexEntriesByStudent(entries) : undefined;
      const results = students.slice(0, size).map((student) =>
        getEntryStudentOptionEligibility({
          entries: byStudent ? (byStudent.get(student.id) ?? []) : entries,
          session,
          student,
        })
      );
      const elapsed = performance.now() - start;
      eligible = results.filter(
        (result) => result.status === "eligible"
      ).length;
      if (eligible !== size)
        throw new Error("Eligibility benchmark result mismatch");
      if (iteration > 0) samples.push(elapsed);
    }
    console.log(
      JSON.stringify({
        students: size,
        entries: entries.length,
        indexed,
        eligible,
        samples,
      })
    );
  }
}
