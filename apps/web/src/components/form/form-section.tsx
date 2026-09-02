export function FormSectionHeading({ children }: { children: string }) {
  return (
    <p className="text-muted-foreground pt-2 text-xs font-medium tracking-wider uppercase">
      {children}
    </p>
  );
}
