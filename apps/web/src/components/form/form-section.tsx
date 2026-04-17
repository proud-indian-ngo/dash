export function FormSectionHeading({ children }: { children: string }) {
  return (
    <p className="pt-2 font-medium text-muted-foreground text-xs uppercase tracking-wider">
      {children}
    </p>
  );
}
