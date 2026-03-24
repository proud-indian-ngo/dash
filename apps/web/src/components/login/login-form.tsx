import { useForm } from "@tanstack/react-form";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { log } from "evlog";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { Loader } from "@/components/loader";
import { authClient } from "@/lib/auth-client";

const loginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const STATUS_MESSAGES: Record<string, string> = {
  "email-verified": "Email verified successfully",
  "password-reset": "Password reset successfully",
};

export function LoginForm() {
  const navigate = useNavigate({
    from: "/login",
  });
  const { status, redirect } = useSearch({ from: "/_auth/login" });
  const { isPending } = authClient.useSession();
  const handledStatusRef = useRef<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

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
      setFormError(null);
      setUnverifiedEmail(null);
      await authClient.signIn.email(
        {
          email: value.email,
          password: value.password,
        },
        {
          onSuccess: () => {
            const safeRedirect =
              redirect?.startsWith("/") && !redirect.startsWith("//")
                ? redirect
                : "/";
            navigate({
              to: safeRedirect,
            });
            toast.success("Login successful");
          },
          onError: (error) => {
            const message = error.error.message || error.error.statusText;
            log.error({
              component: "LoginForm",
              action: "signIn",
              email: value.email,
              error: message,
            });

            if (
              message.toLowerCase().includes("not verified") ||
              message.toLowerCase().includes("verify your email")
            ) {
              setUnverifiedEmail(value.email);
              setFormError(
                "Your email address has not been verified. Please check your inbox."
              );
            } else {
              setFormError(message);
            }
          },
        }
      );
    },
    validators: {
      onChange: loginSchema,
      onSubmit: loginSchema,
    },
  });

  async function handleResendVerification() {
    if (!unverifiedEmail || resending) {
      return;
    }
    setResending(true);
    try {
      await authClient.sendVerificationEmail({
        email: unverifiedEmail,
        callbackURL: "/login",
      });
      toast.success("Verification email sent");
    } catch (error) {
      log.error({
        component: "LoginForm",
        action: "resendVerification",
        email: unverifiedEmail,
        error: error instanceof Error ? error.message : String(error),
      });
      toast.error("Failed to resend verification email");
    } finally {
      setResending(false);
    }
  }

  if (isPending) {
    return <Loader />;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="space-y-2">
        <h2 className="font-bold text-2xl">Login to your account</h2>
        <p className="text-muted-foreground text-sm">
          Enter your email below to login to your account
        </p>
      </div>
      <FormLayout className="space-y-4" form={form}>
        {formError ? (
          <div
            className="rounded-md bg-destructive/10 px-3 py-2 text-destructive text-sm"
            role="alert"
          >
            <p>{formError}</p>
            {unverifiedEmail ? (
              <button
                className="mt-1 font-medium underline underline-offset-4 hover:no-underline"
                disabled={resending}
                onClick={handleResendVerification}
                type="button"
              >
                {resending ? "Sending..." : "Resend verification email"}
              </button>
            ) : null}
          </div>
        ) : null}
        <InputField
          autoComplete="email"
          isRequired
          label="Email"
          name="email"
          placeholder="you@example.com"
          type="email"
        />
        <div className="space-y-1">
          <InputField
            autoComplete="current-password"
            isRequired
            label="Password"
            name="password"
            placeholder="Enter your password"
            type="password"
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
          submittingLabel="Logging in..."
        />
      </FormLayout>
      <p className="text-center text-muted-foreground text-sm">
        Don&apos;t have an account?{" "}
        <Link className="text-foreground hover:underline" to="/register">
          Register
        </Link>
      </p>
    </div>
  );
}
