import type { User } from "@pi-dash/zero/schema";
import { useForm } from "@tanstack/react-form";
import { format } from "date-fns";
import z from "zod";
import { CheckboxField } from "@/components/form/checkbox-field";
import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { PhoneField } from "@/components/form/phone-field";
import { SelectField, type SelectOption } from "@/components/form/select-field";
import { optionalDate } from "@/lib/validators";

const roleOptions: SelectOption[] = [
  { label: "Volunteer", value: "volunteer" },
  { label: "Admin", value: "admin" },
];

const genderOptions: SelectOption[] = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

const userRoleSchema = z.enum(["admin", "volunteer"]);
const genderValueSchema = z.enum(["male", "female"]);

export const baseUserFormSchema = z.object({
  attendedOrientation: z.boolean(),
  dob: optionalDate,
  email: z.email("Invalid email address"),
  emailVerified: z.boolean(),
  gender: genderValueSchema,
  isActive: z.boolean(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string(),
  role: userRoleSchema,
});

export const createUserFormSchema = baseUserFormSchema.extend({
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export const editUserFormSchema = baseUserFormSchema.extend({
  userId: z.string().min(1),
});

export type CreateUserFormValues = z.infer<typeof createUserFormSchema>;
export type EditUserFormValues = z.infer<typeof editUserFormSchema>;

export const toEditUserFormValues = (user: User): EditUserFormValues => {
  const dob = user.dob == null ? "" : format(new Date(user.dob), "yyyy-MM-dd");

  return {
    attendedOrientation: Boolean(user.attendedOrientation),
    dob,
    email: user.email,
    emailVerified: Boolean(user.emailVerified),
    gender: user.gender ?? "male",
    isActive: user.isActive ?? true,
    name: user.name,
    phone: user.phone ?? "",
    role: user.role ?? "volunteer",
    userId: user.id,
  };
};

export const defaultCreateUserFormValues: CreateUserFormValues = {
  attendedOrientation: false,
  dob: "",
  email: "",
  emailVerified: false,
  gender: "male",
  isActive: true,
  name: "",
  password: "",
  phone: "",
  role: "volunteer",
};

const userFieldValidators = {
  dob: { onBlur: baseUserFormSchema.shape.dob },
  email: { onBlur: baseUserFormSchema.shape.email },
  gender: { onBlur: baseUserFormSchema.shape.gender },
  name: { onBlur: baseUserFormSchema.shape.name },
  password: { onBlur: createUserFormSchema.shape.password },
  phone: { onBlur: baseUserFormSchema.shape.phone },
  role: { onBlur: baseUserFormSchema.shape.role },
};

type UserFormProps =
  | {
      initialValues: CreateUserFormValues;
      mode: "create";
      onCancel?: () => void;
      onSubmit: (values: CreateUserFormValues) => Promise<void>;
    }
  | {
      initialValues: EditUserFormValues;
      mode: "edit";
      onCancel: () => void;
      onSubmit: (values: EditUserFormValues) => Promise<void>;
    };

export function UserForm(props: UserFormProps) {
  const userFormSchema = (
    props.mode === "create" ? createUserFormSchema : editUserFormSchema
  ) as never;

  const form = useForm({
    defaultValues: props.initialValues,
    onSubmit: async ({ value }) => {
      if (props.mode === "create") {
        await props.onSubmit(value as CreateUserFormValues);
        form.reset();
        return;
      }

      await props.onSubmit(value as EditUserFormValues);
    },
    validators: {
      onSubmit: userFormSchema,
    },
  });

  const submitLabel = props.mode === "create" ? "Create user" : "Save changes";

  return (
    <FormLayout className="grid gap-3" form={form}>
      <div className="grid gap-3 md:grid-cols-2">
        <InputField
          isRequired
          label="Name"
          name="name"
          validators={userFieldValidators.name}
        />

        <InputField
          isRequired
          label="Email"
          name="email"
          validators={userFieldValidators.email}
        />

        {props.mode === "create" ? (
          <InputField
            isRequired
            label="Password"
            name="password"
            type="password"
            validators={userFieldValidators.password}
          />
        ) : null}

        <SelectField
          isRequired
          label="Role"
          name="role"
          options={roleOptions}
          validators={userFieldValidators.role}
        />

        <PhoneField
          defaultCountry="IN"
          label="Phone"
          name="phone"
          validators={userFieldValidators.phone}
        />

        <DateField
          label="Date of birth"
          name="dob"
          validators={userFieldValidators.dob}
        />

        <SelectField
          isRequired
          label="Gender"
          name="gender"
          options={genderOptions}
          placeholder="Select gender"
          validators={userFieldValidators.gender}
        />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <CheckboxField label="Active" name="isActive" />
        <CheckboxField
          label="Attended orientation"
          name="attendedOrientation"
        />
        <CheckboxField label="Email verified" name="emailVerified" />
      </div>

      <FormActions
        form={form}
        onCancel={props.onCancel}
        submitLabel={submitLabel}
        submittingLabel="Saving..."
      />
    </FormLayout>
  );
}
