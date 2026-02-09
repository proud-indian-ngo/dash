import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pi-dash/design-system/components/ui/card";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { authClient } from "@/lib/auth-client";

const forgotPasswordSchema = z.object({
  email: z.email("Invalid email address"),
});

const forgotPasswordFieldValidators = {
  email: { onBlur: forgotPasswordSchema.shape.email },
};

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);

  const form = useForm({
    defaultValues: {
      email: "",
    },
    onSubmit: async ({ value }) => {
      const { error } = await authClient.requestPasswordReset({
        email: value.email,
        redirectTo: "/reset-password",
      });
      if (error) {
        toast.error(error.message || error.statusText);
        return;
      }
      setSent(true);
    },
    validators: {
      onSubmit: forgotPasswordSchema,
    },
  });

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Forgot your password?</CardTitle>
          <CardDescription>
            Enter your email and we'll send you a reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <p className="text-muted-foreground text-sm">
              Check your email for a reset link. You can close this page.
            </p>
          ) : (
            <FormLayout className="space-y-4" form={form}>
              <InputField
                autoComplete="email"
                isRequired
                label="Email"
                name="email"
                placeholder="m@example.com"
                type="email"
                validators={forgotPasswordFieldValidators.email}
              />
              <FormActions
                className="w-full"
                form={form}
                submitClassName="w-full"
                submitLabel="Send reset link"
                submittingLabel="Sending..."
              />
            </FormLayout>
          )}
          <div className="mt-4 text-center">
            <Link
              className="text-muted-foreground text-sm hover:text-foreground"
              to="/login"
            >
              Back to login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
