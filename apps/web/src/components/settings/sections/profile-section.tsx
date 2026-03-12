import { Input } from "@pi-dash/design-system/components/ui/input";
import { Label } from "@pi-dash/design-system/components/ui/label";
import { useForm } from "@tanstack/react-form";
import { toast } from "sonner";
import z from "zod";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { PhoneField } from "@/components/form/phone-field";
import { SelectField, type SelectOption } from "@/components/form/select-field";
import { authClient } from "@/lib/auth-client";
import { optionalDate } from "@/lib/validators";

const genderOptions: SelectOption[] = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
  { label: "Prefer not to say", value: "unspecified" },
];

const genderSchema = z
  .enum(["male", "female", "unspecified"])
  .or(z.literal(""));

const profileSchema = z.object({
  dob: optionalDate,
  gender: genderSchema,
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function ProfileSection() {
  const { data: session } = authClient.useSession();
  const user = session?.user;

  const form = useForm({
    defaultValues: {
      dob: user?.dob ? new Date(user.dob).toISOString().substring(0, 10) : "",
      gender: (user?.gender ?? "") as "" | "male" | "female" | "unspecified",
      name: user?.name ?? "",
      phone: user?.phone ?? "",
    } satisfies ProfileFormValues,
    onSubmit: async ({ value }) => {
      const { error } = await authClient.updateUser({
        dob: value.dob ? new Date(value.dob) : undefined,
        gender: value.gender || undefined,
        name: value.name,
        phone: value.phone || undefined,
      });
      if (error) {
        toast.error(error.message ?? "Failed to save profile");
      } else {
        toast.success("Profile saved");
      }
    },
    validators: {
      onBlur: profileSchema,
      onSubmit: profileSchema,
    },
  });

  return (
    <FormLayout className="flex flex-col gap-6 p-4" form={form}>
      <div className="flex flex-col gap-4">
        <InputField isRequired label="Name" name="name" />
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="profile-email">Email</Label>
          <Input
            className="opacity-60"
            disabled
            id="profile-email"
            value={user?.email ?? ""}
          />
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <PhoneField defaultCountry="IN" label="Phone" name="phone" />
        <SelectField
          label="Gender"
          name="gender"
          options={genderOptions}
          placeholder="Select gender"
        />
        <DateField label="Date of birth" name="dob" />
      </div>

      <div className="flex justify-end">
        <FormActions submitLabel="Save changes" submittingLabel="Saving..." />
      </div>
    </FormLayout>
  );
}
