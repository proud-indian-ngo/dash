import { env } from "@pi-dash/env/web";
import { queries } from "@pi-dash/zero/queries";
import { useQuery } from "@rocicorp/zero/react";
import { createFileRoute } from "@tanstack/react-router";
import { Loader } from "@/components/loader";
import { StudentDetail } from "@/components/students/student-detail";

export const Route = createFileRoute("/_app/students/$id")({
  head: () => ({
    meta: [{ title: `Student Details | ${env.VITE_APP_NAME}` }],
  }),
  loader: ({ context, params }) => {
    context.zero?.preload(queries.student.byId({ id: params.id }));
  },
  component: StudentDetailRouteComponent,
});

function StudentDetailRouteComponent() {
  const { id } = Route.useParams();
  const [student, result] = useQuery(queries.student.byId({ id }));

  if (!student && result.type !== "complete") {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <Loader />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
        <p className="text-muted-foreground text-sm">Student not found.</p>
      </div>
    );
  }

  return (
    <div className="app-container mx-auto max-w-7xl px-2 py-6 sm:px-4">
      <StudentDetail student={student} />
    </div>
  );
}
