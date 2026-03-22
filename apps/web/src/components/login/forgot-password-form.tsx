import { Button } from "@pi-dash/design-system/components/ui/button";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { log } from "evlog";
import { useCallback, useEffect, useRef, useState } from "react";
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

const COOLDOWN_SECONDS = 60;

function isNotFoundError(message: string): boolean {
  const msg = message.toLowerCase();
  return msg.includes("not found") || msg.includes("user not found");
}

function resendButtonLabel(cooldown: number, resending: boolean) {
  if (cooldown > 0) {
    return `Resend in ${cooldown}s`;
  }
  if (resending) {
    return "Sending...";
  }
  return "Resend email";
}

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [sentEmail, setSentEmail] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const startCooldown = useCallback(() => {
    setCooldown(COOLDOWN_SECONDS);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => clearInterval(timerRef.current);
  }, []);

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
        log.error({
          component: "ForgotPasswordForm",
          action: "requestPasswordReset",
          email: value.email,
          error: error.message || error.statusText,
        });
        if (!isNotFoundError(error.message || "")) {
          toast.error("Something went wrong. Please try again.");
        }
      }
      setSentEmail(value.email);
      setSent(true);
      startCooldown();
    },
    validators: {
      onSubmit: forgotPasswordSchema,
    },
  });

  async function handleResend() {
    if (cooldown > 0 || resending) {
      return;
    }
    setResending(true);
    const { error } = await authClient.requestPasswordReset({
      email: sentEmail,
      redirectTo: "/reset-password",
    });
    if (error) {
      log.error({
        component: "ForgotPasswordForm",
        action: "resendPasswordReset",
        email: sentEmail,
        error: error.message || error.statusText,
      });
      if (!isNotFoundError(error.message || "")) {
        toast.error("Something went wrong. Please try again.");
      }
    }
    startCooldown();
    setResending(false);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h2 className="font-bold text-2xl">Forgot your password?</h2>
        <p className="text-muted-foreground text-sm">
          Enter your email and we'll send you a reset link.
        </p>
      </div>
      {sent ? (
        <div className="space-y-3">
          <p className="text-muted-foreground text-sm">
            If an account exists for <strong>{sentEmail}</strong>, we've sent a
            password reset link. Check your email.
          </p>
          <Button
            disabled={cooldown > 0 || resending}
            onClick={handleResend}
            size="sm"
            type="button"
            variant="outline"
          >
            {resendButtonLabel(cooldown, resending)}
          </Button>
        </div>
      ) : (
        <FormLayout className="space-y-4" form={form}>
          <InputField
            autoComplete="email"
            isRequired
            label="Email"
            name="email"
            placeholder="you@example.com"
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
      <div className="text-center">
        <Link
          className="text-muted-foreground text-sm hover:text-foreground"
          to="/login"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
