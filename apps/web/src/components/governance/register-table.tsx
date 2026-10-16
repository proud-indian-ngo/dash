import { Badge } from "@pi-dash/design-system/components/ui/badge";
import { Skeleton } from "@pi-dash/design-system/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pi-dash/design-system/components/ui/table";
import {
  boardOn,
  isEvidenced,
  lastDayOf,
  type RegisterInput,
  TRUSTEE_OFFICE_LABELS,
  TRUSTEE_TERM_BASIS_LABELS,
} from "@pi-dash/shared/governance";

import { formatIso, type RegisterTrustee } from "./register-data";

function termText(term: RegisterTrustee["terms"][number]): string {
  const last = lastDayOf(term);
  if (last) {
    return `${formatIso(term.startsOn)} to ${formatIso(last)}`;
  }
  return `From ${formatIso(term.startsOn)}, for life`;
}

function evidenceBadge(trustee: RegisterTrustee) {
  const rows = [...trustee.terms, ...trustee.offices];
  const missing = rows.filter((row) => {
    const evidence = isEvidenced(row);
    return !(evidence.start && evidence.end);
  }).length;
  return missing === 0 ? (
    <Badge variant="secondary">Evidenced</Badge>
  ) : (
    <Badge className="text-warning-foreground" variant="outline">
      {missing === 1 ? "1 date unevidenced" : `${missing} dates unevidenced`}
    </Badge>
  );
}

function TrusteeRowView({
  offices,
  onView,
  term,
  trustee,
}: {
  offices: string[];
  onView: (trustee: RegisterTrustee) => void;
  term: RegisterTrustee["terms"][number] | null;
  trustee: RegisterTrustee;
}) {
  return (
    <TableRow
      className="cursor-pointer"
      data-testid={`trustee-row-${trustee.id}`}
      onClick={() => onView(trustee)}
    >
      <TableCell className="font-medium">
        <span className="flex flex-wrap items-center gap-2">
          {trustee.legalName}
          {trustee.isCoFounder ? (
            <Badge variant="outline">Co-Founder</Badge>
          ) : null}
        </span>
      </TableCell>
      <TableCell>{offices.length > 0 ? offices.join(", ") : "—"}</TableCell>
      <TableCell className="text-muted-foreground">
        {term ? termText(term) : "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {term ? TRUSTEE_TERM_BASIS_LABELS[term.basis] : "—"}
      </TableCell>
      <TableCell>{evidenceBadge(trustee)}</TableCell>
    </TableRow>
  );
}

function Header() {
  return (
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Offices</TableHead>
        <TableHead>Term</TableHead>
        <TableHead>Basis</TableHead>
        <TableHead>Evidence</TableHead>
      </TableRow>
    </TableHeader>
  );
}

/** The board on a date, then everyone else on the register. */
export function RegisterTable({
  input,
  isLoading,
  on,
  onView,
}: {
  input: RegisterInput<RegisterTrustee>;
  isLoading: boolean;
  on: string;
  onView: (trustee: RegisterTrustee) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }
  const board = boardOn(input, on);
  const onBoard = new Set(board.map((m) => m.trustee.id));
  const others = input.trustees.filter((t) => !onBoard.has(t.id));

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="board-heading" className="flex flex-col gap-2">
        <h2 className="text-base font-semibold" id="board-heading">
          On the board ({board.length})
        </h2>
        {board.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No one was a trustee on this date.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <Header />
              <TableBody>
                {board.map((member) => (
                  <TrusteeRowView
                    key={member.trustee.id}
                    offices={member.offices.map(
                      (o) => TRUSTEE_OFFICE_LABELS[o]
                    )}
                    onView={onView}
                    term={
                      member.trustee.terms.find(
                        (t) => t.id === member.term.id
                      ) ?? null
                    }
                    trustee={member.trustee}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
      {others.length > 0 ? (
        <section
          aria-labelledby="others-heading"
          className="flex flex-col gap-2"
        >
          <h2 className="text-base font-semibold" id="others-heading">
            Not on the board on this date ({others.length})
          </h2>
          <div className="rounded-md border">
            <Table>
              <Header />
              <TableBody>
                {others.map((trustee) => (
                  <TrusteeRowView
                    key={trustee.id}
                    offices={[]}
                    onView={onView}
                    term={trustee.terms.at(-1) ?? null}
                    trustee={trustee}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
