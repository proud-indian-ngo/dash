import { env } from "@pi-dash/env/web";
import { useForm } from "@tanstack/react-form";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import * as z from "zod";

import { FormActions } from "@/components/form/form-actions";
import { FormLayout } from "@/components/form/form-layout";
import { InputField } from "@/components/form/input-field";
import { StandalonePage } from "@/components/shared/not-found-state";
import {
  getHasPassword,
  setInitialPassword,
} from "@/functions/account-password";
import { getCachedAuth } from "@/lib/auth-cache";

/** Only same-site paths, so the redirect can't leave the dashboard. */
const safeTarget = (target: string | undefined) =>
  target?.startsWith("/") && !target.startsWith("//") ? target : "/";

const passwordSchema = z
  .object({
    confirmPassword: z.string(),
    newPassword: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128, "Password must be at most 128 characters"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

// An assistant's sign-up lands here after verifying its email: the account is
// signed in but has no password yet (assistants.md).
// biome-ignore assist/source/useSortedKeys: TanStack Router option order preserves route type inference.
export const Route = createFileRoute("/set-password")({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ location, search }) => {
    const { session } = await getCachedAuth();
    if (!session) {
      throw redirect({ search: { redirect: location.href }, to: "/login" });
    }
    if ((await getHasPassword()).hasPassword) {
      throw redirect({ href: safeTarget(search.redirect) });
    }
  },
  head: () => ({
    meta: [{ title: `Set your password | ${env.VITE_APP_NAME}` }],
  }),
  component: SetPasswordPage,
});

function SetPasswordPage() {
  const navigate = useNavigate();
  const { redirect: target } = Route.useSearch();

  const form = useForm({
    defaultValues: { confirmPassword: "", newPassword: "" },
    onSubmit: async ({ value }) => {
      try {
        await setInitialPassword({ data: { newPassword: value.newPassword } });
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Couldn't set the password"
        );
        return;
      }
      toast.success("Password set");
      navigate({ href: safeTarget(target), replace: true });
    },
    validators: { onChange: passwordSchema, onSubmit: passwordSchema },
  });

  return (
    <StandalonePage>
      <div className="flex w-full max-w-md flex-col gap-6 self-start pt-6 md:self-auto md:pt-0">
        <div className="flex flex-col gap-2">
          <h1 className="font-display text-2xl font-semibold">
            Set your password
          </h1>
          <p className="text-muted-foreground text-sm">
            Your email is confirmed. Choose a password to sign in to the
            dashboard next time.
          </p>
        </div>
        <FormLayout className="space-y-4" form={form}>
          <InputField
            autoComplete="new-password"
            isRequired
            label="New password"
            name="newPassword"
            placeholder="Enter a password"
            type="password"
          />
          <InputField
            autoComplete="new-password"
            isRequired
            label="Confirm password"
            name="confirmPassword"
            placeholder="Enter it again"
            type="password"
          />
          <FormActions
            className="w-full"
            form={form}
            submitClassName="w-full"
            submitLabel="Set password"
            submittingLabel="Saving..."
          />
        </FormLayout>
      </div>
    </StandalonePage>
  );
}
