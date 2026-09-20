import type {
  KalakritiAwardEntry,
  KalakritiAwardRecipient as KalakritiAwardMember,
} from "@pi-dash/shared/kalakriti-awards";

import { PersonQrPanel } from "@/components/kalakriti/person-qr-panel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/shared/responsive-sheet";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

export function AwardStudentDetailSheet({
  selection,
  onOpenChange,
}: {
  selection: {
    entry: KalakritiAwardEntry;
    member: KalakritiAwardMember;
  } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const entry = selection?.entry;
  const member = selection?.member;
  return (
    <Sheet open={Boolean(selection)} onOpenChange={onOpenChange}>
      <SheetContent className="overflow-y-auto">
        {entry && member ? (
          <>
            <SheetHeader>
              <SheetTitle>{member.name}</SheetTitle>
              <SheetDescription>
                Award recipient identity and published Competition result.
              </SheetDescription>
            </SheetHeader>
            <div className="grid gap-6 px-6 pb-6">
              <div className="grid gap-3">
                <DetailRow label="Student ID" value={member.humanId} />
                <DetailRow
                  label="Gender"
                  value={member.gender === "female" ? "Female" : "Male"}
                />
                <DetailRow label="Center" value={entry.centerName} />
                <DetailRow label="Competition" value={entry.competitionName} />
                <DetailRow label="Age Category" value={entry.ageCategoryName} />
                <DetailRow
                  label="Award"
                  value={entry.award === "winner" ? "Winner" : "Runner-up"}
                />
                <DetailRow
                  label="Handover status"
                  value={member.awarded ? "Awarded" : "Pending"}
                />
              </div>
              <PersonQrPanel enabled id={member.studentId} type="student" />
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
