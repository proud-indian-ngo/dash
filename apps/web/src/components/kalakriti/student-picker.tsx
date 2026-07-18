import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxItem,
  ComboboxList,
  useComboboxAnchor,
} from "@pi-dash/design-system/components/ui/combobox";
import { useEventCallback } from "@pi-dash/design-system/hooks/use-event-callback";
import { useState } from "react";
import type { KalakritiEntryStudent } from "./entry-form-dialog";

interface StudentPickerProps {
  errorProps: {
    "aria-describedby": string | undefined;
    "aria-invalid": boolean;
  };
  inputId?: string;
  maximum: number;
  onBlur: () => void;
  onValueChange: (ids: string[]) => void;
  students: readonly KalakritiEntryStudent[];
  value: string[];
}

export function StudentPicker({
  errorProps,
  inputId,
  maximum,
  onBlur,
  onValueChange,
  students,
  value,
}: StudentPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const anchorRef = useComboboxAnchor();
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase();
  const visibleStudents = normalizedQuery
    ? students.filter((student) =>
        `${student.humanId} ${student.name}`
          .toLocaleLowerCase()
          .includes(normalizedQuery)
      )
    : students;
  const studentById = new Map(students.map((student) => [student.id, student]));
  const handleValueChange = useEventCallback((ids: string[]) =>
    onValueChange(ids.slice(0, maximum))
  );

  return (
    <div className="space-y-2">
      <Combobox
        filter={null}
        inputValue={searchQuery}
        multiple
        onInputValueChange={setSearchQuery}
        onValueChange={handleValueChange}
        value={value}
      >
        <ComboboxChips ref={anchorRef}>
          {value.map((id) => {
            const student = studentById.get(id);
            return (
              <ComboboxChip key={id}>
                {student ? (
                  `${student.humanId} · ${student.name}`
                ) : (
                  <span>{id}</span>
                )}
              </ComboboxChip>
            );
          })}
          <ComboboxChipsInput
            {...errorProps}
            aria-required="true"
            disabled={value.length >= maximum}
            id={inputId}
            onBlur={onBlur}
            placeholder={
              value.length >= maximum
                ? `Maximum ${maximum} selected`
                : "Search by Student ID or name..."
            }
          />
        </ComboboxChips>
        <ComboboxContent anchor={anchorRef}>
          <ComboboxList>
            {visibleStudents.length === 0 ? (
              <div className="py-2 text-center text-muted-foreground text-xs">
                No matching Students found.
              </div>
            ) : null}
            {visibleStudents.map((student) => (
              <ComboboxItem key={student.id} value={student.id}>
                <div className="min-w-0">
                  <p className="truncate font-medium">{student.name}</p>
                  <p className="text-muted-foreground text-xs">
                    {student.humanId} · {student.ageCategory.name}
                  </p>
                </div>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <p className="text-muted-foreground text-xs">
        {value.length}/{maximum} Students selected
      </p>
    </div>
  );
}
