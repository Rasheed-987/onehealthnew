export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

/** Stand-in for a section whose screens are not built yet. */
export function ComingSoon({ note }: { note: string }) {
  return (
    <div className="rounded-card border border-dashed border-border-strong bg-surface p-10 text-center">
      <p className="text-sm font-semibold text-foreground">Not built yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{note}</p>
    </div>
  );
}
