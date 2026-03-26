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
  dob: z.date({ error: "Date of birth is required" }),
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

export function RegisterForm() {
  const navigate = useNavigate({ from: "/register" });
  const { isPending } = authClient.useSession();

  const form = useForm({
    defaultValues: {
      confirmPassword: "",
      dob: undefined as Date | undefined,
      email: "",
      gender: "" as "" | "male" | "female",
      name: "",
      password: "",
      phone: "",
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.signUp.email({
        dob: value.dob,
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
      onChange: registerSchema,
      onSubmit: registerSchema,
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h2 className="font-bold text-2xl">Create your account</h2>
        <p className="text-muted-foreground text-sm">
          Enter your details below to create your account
        </p>
      </div>
      <FormLayout className="space-y-4" form={form}>
        <InputField
          autoComplete="name"
          isRequired
          label="Name"
          name="name"
          placeholder="Your full name"
        />
        <InputField
          autoComplete="email"
          isRequired
          label="Email"
          name="email"
          placeholder="you@example.com"
          type="email"
        />
        <InputField
          autoComplete="new-password"
          isRequired
          label="Password"
          name="password"
          placeholder="Create a password"
          type="password"
        />
        <InputField
          autoComplete="new-password"
          isRequired
          label="Confirm password"
          name="confirmPassword"
          placeholder="Confirm your password"
          type="password"
        />
        <PhoneField
          defaultCountry="IN"
          isRequired
          label="Phone"
          name="phone"
          placeholder="Your phone number"
        />
        <DateField isRequired label="Date of birth" name="dob" />
        <SelectField
          isRequired
          label="Gender"
          name="gender"
          options={genderOptions}
          placeholder="Select gender"
        />
        <FormActions
          className="w-full"
          form={form}
          submitClassName="w-full"
          submitLabel="Register"
          submittingLabel="Registering..."
        />
      </FormLayout>
      <p className="text-center text-muted-foreground text-sm">
        Already have an account?{" "}
        <Link className="text-foreground hover:underline" to="/login">
          Login
        </Link>
      </p>
    </div>
  );
}
