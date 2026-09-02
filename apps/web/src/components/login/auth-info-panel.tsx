const steps = [
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
] as const;

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
      <ol className="space-y-4">
        {steps.map((step) => (
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
      <p className="text-sidebar-foreground/60 text-sm">
        Questions? Reach out at{" "}
        <a
          className="text-sidebar-foreground underline-offset-2 hover:underline"
          href="mailto:connect@proudindian.ngo"
        >
          connect@proudindian.ngo
        </a>
      </p>
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
