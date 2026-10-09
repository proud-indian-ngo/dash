import type { PublicSessionSummary } from "@pi-dash/shared/public-events";
import { format } from "date-fns";

import { LONG_DATE_TIME } from "@/lib/date-formats";

interface Step {
  description: string;
  number: number;
  title: string;
}

const steps: readonly Step[] = [
  {
    description: "Create your account with basic details",
    number: 1,
    title: "Sign up",
  },
  {
    description: "Confirm your email address",
    number: 2,
    title: "Verify email",
  },
  {
    description: "Learn about our programs",
    number: 3,
    title: "Complete orientation",
  },
  {
    description: "Get assigned and start contributing",
    number: 4,
    title: "Join a team",
  },
];

const eventSignupSteps: readonly Step[] = [
  {
    description: "Create your account with basic details",
    number: 1,
    title: "Sign up",
  },
  {
    description: "Confirm your email address",
    number: 2,
    title: "Verify email",
  },
  {
    description: "We send your request to join to the session team",
    number: 3,
    title: "Request sent",
  },
  {
    description: "The team reviews your request and confirms your spot",
    number: 4,
    title: "Hear back",
  },
];

function StepList({ items }: { items: readonly Step[] }) {
  return (
    <ol className="space-y-4">
      {items.map((step) => (
        <li className="flex items-start gap-3" key={step.number}>
          <span className="bg-sidebar-foreground/10 flex size-7 shrink-0 items-center justify-center rounded-full text-sm font-semibold">
            {step.number}
          </span>
          <div>
            <p className="font-medium">{step.title}</p>
            <p className="text-sidebar-foreground/70 text-sm">
              {step.description}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ContactLine() {
  return (
    <p className="text-sidebar-foreground/60 text-sm">
      Questions? Reach out at{" "}
      <a
        className="text-sidebar-foreground underline-offset-2 hover:underline"
        href="mailto:connect@proudindian.ngo"
      >
        connect@proudindian.ngo
      </a>
    </p>
  );
}

export function SignupInfoPanel() {
  return (
    <div className="text-sidebar-foreground max-w-md space-y-8">
      <div className="space-y-3">
        <h2 className="text-2xl font-bold">
          Join the Proud Indian volunteer community
        </h2>
        <p className="text-sidebar-foreground/80">
          Make a difference in your community by volunteering your time and
          skills.
        </p>
      </div>
      <StepList items={steps} />
      <ContactLine />
    </div>
  );
}

export function LoginInfoPanel() {
  return (
    <div className="text-sidebar-foreground max-w-md space-y-3">
      <h2 className="text-2xl font-bold">Welcome back</h2>
      <p className="text-sidebar-foreground/80">
        Your contributions make a real difference. Let's keep the momentum
        going.
      </p>
    </div>
  );
}

/**
 * Side panel for website event links on register and login: names the
 * session, or says it closed. Unknown or private events keep the generic
 * panels, since the summary is null for them.
 */
export function EventInfoPanel({
  mode,
  session,
}: {
  mode: "login" | "register";
  session: PublicSessionSummary;
}) {
  const when = format(new Date(session.startTime), LONG_DATE_TIME);
  let heading: string;
  let description: string;
  if (!session.open) {
    heading = `${session.name} is no longer open for sign-ups`;
    description =
      mode === "register"
        ? "You can still create an account and find other sessions after you log in."
        : "Log in to find other sessions you can join.";
  } else if (mode === "register") {
    heading = `Join ${session.name}`;
    description =
      "Create your volunteer account and we'll send the team your request to join this session.";
  } else {
    heading = `Log in to join ${session.name}`;
    description = "We'll take you straight to this session after you log in.";
  }

  return (
    <div
      className="text-sidebar-foreground max-w-md space-y-8"
      data-testid="auth-event-info-panel"
    >
      <div className="space-y-3">
        <h2 className="text-2xl font-bold">{heading}</h2>
        <p className="text-sidebar-foreground/70 text-sm">
          {when} · {session.area}
        </p>
        <p className="text-sidebar-foreground/80">{description}</p>
      </div>
      {mode === "register" && session.open ? (
        <StepList items={eventSignupSteps} />
      ) : null}
      <ContactLine />
    </div>
  );
}
