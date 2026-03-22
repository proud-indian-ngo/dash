const steps = [
  {
    number: 1,
    title: "Sign up",
    description: "Create your account with basic details",
  },
  {
    number: 2,
    title: "Verify email",
    description: "Confirm your email address",
  },
  {
    number: 3,
    title: "Complete orientation",
    description: "Learn about our programs",
  },
  {
    number: 4,
    title: "Join a team",
    description: "Get assigned and start contributing",
  },
] as const;

export function SignupInfoPanel() {
  return (
    <div className="max-w-md space-y-8 text-white">
      <div className="space-y-3">
        <h2 className="font-bold text-2xl">
          Join the Proud Indian volunteer community
        </h2>
        <p className="text-white/80">
          Make a difference in your community by volunteering your time and
          skills.
        </p>
      </div>
      <ol className="space-y-4">
        {steps.map((step) => (
          <li className="flex items-start gap-3" key={step.number}>
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20 font-semibold text-sm">
              {step.number}
            </span>
            <div>
              <p className="font-medium">{step.title}</p>
              <p className="text-sm text-white/70">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-sm text-white/60">
        Questions? Reach out at{" "}
        <a
          className="text-white underline-offset-2 hover:underline"
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
    <div className="max-w-md space-y-3 text-white">
      <h2 className="font-bold text-2xl">Welcome back</h2>
      <p className="text-white/80">
        Your contributions make a real difference. Let's keep the momentum
        going.
      </p>
    </div>
  );
}
