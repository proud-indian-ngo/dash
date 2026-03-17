import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { useForm } from "@tanstack/react-form";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { log } from "evlog";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { authClient } from "@/lib/auth-client";
import { Loader } from "../loader";

const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const loginFieldValidators = {
  email: { onBlur: loginSchema.shape.email },
  password: { onBlur: loginSchema.shape.password },
};

const STATUS_MESSAGES: Record<string, string> = {
  "email-verified": "Email verified successfully",
  "password-reset": "Password reset successfully",
};

export function LoginForm() {
  const navigate = useNavigate({
    from: "/login",
  });
  const { status } = useSearch({ from: "/_auth/login" });
  const { isPending } = authClient.useSession();
  const handledStatusRef = useRef<string | null>(null);

  useEffect(() => {
    if (!status || handledStatusRef.current === status) {
      return;
    }

    const message = STATUS_MESSAGES[status];
    if (message) {
      handledStatusRef.current = status;
      toast.success(message, { id: status });
      navigate({ to: "/login", search: {}, replace: true });
    }
  }, [navigate, status]);

  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    onSubmit: async ({ value }) => {
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            navigate({
              to: "/",
            });
            toast.success("Login successful");
          },
          onError: (error) => {
            log.error({
              component: "LoginForm",
              action: "signIn",
              email: value.email,
              error: error.error.message || error.error.statusText,
            });
            toast.error(error.error.message || error.error.statusText);
          },
        }
      );
    },
    validators: {
      onSubmit: loginSchema,
    },
  });

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Login to your account</CardTitle>
          <CardDescription>
            Enter your email below to login to your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormLayout className="space-y-4" form={form}>
            <InputField
              autoComplete="email"
              isRequired
              label="Email"
              name="email"
              placeholder="m@example.com"
              type="email"
              validators={loginFieldValidators.email}
            />
            <div className="space-y-1">
              <InputField
                autoComplete="current-password"
                isRequired
                label="Password"
                name="password"
                type="password"
                validators={loginFieldValidators.password}
              />
              <div className="text-right">
                <Link
                  className="text-muted-foreground text-sm hover:text-foreground"
                  to="/forgot-password"
                >
                  Forgot password?
                </Link>
              </div>
            </div>
            <FormActions
              className="w-full"
              form={form}
              submitClassName="w-full"
              submitLabel="Login"
              submittingLabel="Submitting..."
            />
          </FormLayout>
        </CardContent>
      </Card>
      <p className="text-center text-muted-foreground text-sm">
        Don&apos;t have an account?{" "}
        <Link className="text-foreground hover:underline" to="/register">
          Register
        </Link>
      </p>
    </div>
  );
}
