import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { log } from "evlog";
import { isValidPhoneNumber } from "libphonenumber-js";
import { toast } from "sonner";
import z from "zod";

import { DateField } from "@/components/form/date-field";
import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { PhoneField } from "@/components/form/phone-field-lazy";
import { SelectField, type SelectOption } from "@/components/form/select-field";
import { Loader } from "@/components/loader";
import { authClient } from "@/lib/auth-client";

const genderOptions: SelectOption[] = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

const registerFields = {
  confirmPassword: z.string().min(8, "Password must be at least 8 characters"),
  dob: z.string().date("Invalid date"),
  email: z.email("Invalid email address"),
  gender: z.enum(["male", "female"], { error: "Please select a gender" }),
  name: z.string().min(2, "Name must be at least 2 characters"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z
    .string()
    .min(1, "Phone number is required")
    .refine((v) => isValidPhoneNumber(v), "Invalid phone number"),
};

const registerSchema = z
  .object(registerFields)
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const registerFieldValidators = {
  confirmPassword: { onBlur: registerFields.confirmPassword },
  dob: { onChange: registerFields.dob },
  email: { onBlur: registerFields.email },
  gender: { onChange: registerFields.gender },
  name: { onBlur: registerFields.name },
  password: { onBlur: registerFields.password },
  phone: { onBlur: registerFields.phone },
};

export function RegisterForm() {
  const navigate = useNavigate({ from: "/register" });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      confirmPassword: "",
      dob: "",
      email: "",
      gender: "" as "" | "male" | "female",
      name: "",
      password: "",
      phone: "",
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signUp.email({
        dob: new Date(value.dob),
        email: value.email,
        gender: value.gender as "male" | "female",
        name: value.name,
        password: value.password,
        phone: value.phone,
      });
      if (error) {
        log.error({
          component: "RegisterForm",
          action: "signUp",
          email: value.email,
          error: error.message || error.statusText,
        });
        toast.error(error.message || error.statusText);
        return;
      }
      toast.success(
        "Registration successful. Please check your email to verify your account."
      );
      navigate({ to: "/login" });
    },
    validators: {
      onSubmit: registerSchema,
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Create your account</CardTitle>
          <CardDescription>
            Enter your details below to create your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormLayout className="space-y-4" form={form}>
            <InputField
              autoComplete="name"
              isRequired
              label="Name"
              name="name"
              placeholder="Your full name"
              validators={registerFieldValidators.name}
            />
            <InputField
              autoComplete="email"
              isRequired
              label="Email"
              name="email"
              placeholder="m@example.com"
              type="email"
              validators={registerFieldValidators.email}
            />
            <InputField
              autoComplete="new-password"
              isRequired
              label="Password"
              name="password"
              type="password"
              validators={registerFieldValidators.password}
            />
            <InputField
              autoComplete="new-password"
              isRequired
              label="Confirm password"
              name="confirmPassword"
              type="password"
              validators={registerFieldValidators.confirmPassword}
            />
            <PhoneField
              defaultCountry="IN"
              isRequired
              label="Phone"
              name="phone"
              validators={registerFieldValidators.phone}
            />
            <DateField
              isRequired
              label="Date of birth"
              name="dob"
              validators={registerFieldValidators.dob}
            />
            <SelectField
              isRequired
              label="Gender"
              name="gender"
              options={genderOptions}
              placeholder="Select gender"
              validators={registerFieldValidators.gender}
            />
            <FormActions
              className="w-full"
              form={form}
              submitClassName="w-full"
              submitLabel="Register"
              submittingLabel="Registering..."
            />
          </FormLayout>
        </CardContent>
      </Card>
      <p className="text-center text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link className="text-foreground hover:underline" to="/login">
          Login
        </Link>
      </p>
    </div>
  );
}
