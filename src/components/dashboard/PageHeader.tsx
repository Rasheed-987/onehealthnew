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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}

/** Stand-in for a section whose screens are not built yet. */
export function ComingSoon({ note }: { note: string }) {
  return (
    <div className="card-soft border-dashed p-10 text-center">
      <p className="text-sm font-semibold text-foreground">Not built yet</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{note}</p>
    </div>
  );
}
