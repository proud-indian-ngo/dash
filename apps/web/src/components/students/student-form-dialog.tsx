import { Button } from "@pi-dash/design-system/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@pi-dash/design-system/components/ui/combobox";
import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pi-dash/design-system/components/ui/select";
import { Textarea } from "@pi-dash/design-system/components/ui/textarea";
import { cityValues } from "@pi-dash/shared/constants";
import { mutators } from "@pi-dash/zero/mutators";
import { queries } from "@pi-dash/zero/queries";
import type { Center } from "@pi-dash/zero/schema";
import { useQuery, useZero } from "@rocicorp/zero/react";
import { type FormEvent, useEffect, useState } from "react";
import { uuidv7 } from "uuidv7";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/shared/responsive-dialog";
import { handleMutationResult } from "@/lib/mutation-result";

const NONE_CENTER = "__none__";
const GENDER_OPTIONS = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

function getStudentSuccessMsg(isEdit: boolean): string {
  return isEdit ? "Student updated" : "Student created";
}

function submitButtonLabel(submitting: boolean, isEdit: boolean): string {
  if (submitting) {
    return isEdit ? "Saving..." : "Creating...";
  }
  return isEdit ? "Save" : "Create";
}

interface StudentFormDialogProps {
  initialValues?: {
    id: string;
    name: string;
    dateOfBirth: number | null;
    gender: "male" | "female" | null;
    centerId: string | null;
    city: string;
    notes: string | null;
  };
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function StudentFormDialog({
  initialValues,
  onOpenChange,
  open,
}: StudentFormDialogProps) {
  const zero = useZero();
  const isEdit = !!initialValues;

  const [name, setName] = useState(initialValues?.name ?? "");
  const [dateOfBirth, setDateOfBirth] = useState(
    initialValues?.dateOfBirth
      ? new Date(initialValues.dateOfBirth).toISOString().split("T")[0]
      : ""
  );
  const [gender, setGender] = useState(initialValues?.gender ?? "");
  const [centerId, setCenterId] = useState(initialValues?.centerId ?? "");
  const [city, setCity] = useState(initialValues?.city ?? "bangalore");
  const [notes, setNotes] = useState(initialValues?.notes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const [centers] = useQuery(queries.center.all());

  const centerOptions = (centers ?? []).map((c: Center) => ({
    label: c.name,
    value: c.id,
  }));
  const centerLabelByValue = new Map(
    centerOptions.map((option) => [option.value, option.label])
  );
  const centerItems = [
    NONE_CENTER,
    ...centerOptions.map((option) => option.value),
  ];

  useEffect(() => {
    if (open) {
      setName(initialValues?.name ?? "");
      setDateOfBirth(
        initialValues?.dateOfBirth
          ? new Date(initialValues.dateOfBirth).toISOString().split("T")[0]
          : ""
      );
      setGender(initialValues?.gender ?? "");
      setCenterId(initialValues?.centerId ?? "");
      setCity(initialValues?.city ?? "bangalore");
      setNotes(initialValues?.notes ?? "");
    }
  }, [open, initialValues]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      return;
    }

    setSubmitting(true);
    const dateOfBirthMs = dateOfBirth
      ? new Date(`${dateOfBirth}T00:00:00Z`).getTime()
      : null;
    const commonArgs = {
      name: trimmedName,
      dateOfBirth: dateOfBirthMs,
      gender: (gender as "male" | "female") || undefined,
      centerId: centerId || undefined,
      city: (city as (typeof cityValues)[number]) || undefined,
      notes: notes.trim() || undefined,
      now: Date.now(),
    };

    const mutation = isEdit
      ? zero.mutate(
          mutators.student.update({ id: initialValues.id, ...commonArgs })
        )
      : zero.mutate(mutators.student.create({ id: uuidv7(), ...commonArgs }));
    const res = await mutation.server;
    setSubmitting(false);
    handleMutationResult(res, {
      mutation: isEdit ? "student.update" : "student.create",
      entityId: isEdit ? initialValues.id : "new",
      successMsg: getStudentSuccessMsg(isEdit),
      errorMsg: isEdit ? "Couldn't update student" : "Couldn't create student",
    });
    if (res.type !== "error") {
      onOpenChange(false);
    }
  };

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Student" : "Create Student"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {isEdit ? "Edit student details" : "Create a new student"}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="student-name">Name</Label>
            <Input
              id="student-name"
              onChange={(e) => setName(e.target.value)}
              placeholder="Student name"
              required
              value={name}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="student-dob">Date of Birth</Label>
            <Input
              id="student-dob"
              onChange={(e) => setDateOfBirth(e.target.value)}
              type="date"
              value={dateOfBirth}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="student-gender">Gender</Label>
            <Select
              onValueChange={(val) => setGender(val as "male" | "female" | "")}
              value={gender || ""}
            >
              <SelectTrigger id="student-gender">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                {GENDER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="student-center">Center</Label>
            <Combobox
              items={centerItems}
              itemToStringLabel={(value) => {
                if (value === NONE_CENTER) {
                  return "None";
                }
                return centerLabelByValue.get(value) ?? String(value);
              }}
              onValueChange={(value) => {
                setCenterId(value === NONE_CENTER || !value ? "" : value);
              }}
              value={centerId || NONE_CENTER}
            >
              <ComboboxInput
                aria-label="Center"
                className="w-full"
                id="student-center"
                placeholder="None"
              />
              <ComboboxContent className="w-fit min-w-[var(--anchor-width)] max-w-[min(32rem,var(--available-width))]">
                <ComboboxList>
                  {(itemValue) => (
                    <ComboboxItem
                      className="items-start"
                      key={itemValue}
                      value={itemValue}
                    >
                      <span className="block min-w-0 whitespace-normal break-words">
                        {itemValue === NONE_CENTER
                          ? "None"
                          : (centerLabelByValue.get(itemValue) ?? itemValue)}
                      </span>
                    </ComboboxItem>
                  )}
                </ComboboxList>
                <ComboboxEmpty>No matching centers.</ComboboxEmpty>
              </ComboboxContent>
            </Combobox>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="student-city">City</Label>
            <Select
              onValueChange={(value: string | null) =>
                setCity((value || "bangalore") as (typeof cityValues)[number])
              }
              value={city || "bangalore"}
            >
              <SelectTrigger id="student-city">
                <SelectValue placeholder="Select city" />
              </SelectTrigger>
              <SelectContent>
                {cityValues.map((cityValue) => (
                  <SelectItem key={cityValue} value={cityValue}>
                    {cityValue}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="student-notes">Notes</Label>
            <Textarea
              id="student-notes"
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes"
              rows={3}
              value={notes}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={submitting}
              onClick={() => onOpenChange(false)}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
            <Button disabled={submitting || !name.trim()} type="submit">
              {submitButtonLabel(submitting, isEdit)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
