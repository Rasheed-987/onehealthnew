// Tailwind scans source text literally, so every class has to appear in full.
const brandScales = [
  {
    name: "green",
    swatches: [
      "bg-green-50",
      "bg-green-100",
      "bg-green-200",
      "bg-green-300",
      "bg-green-400",
      "bg-green-500",
      "bg-green-600",
      "bg-green-700",
      "bg-green-800",
      "bg-green-900",
    ],
  },
  {
    name: "red",
    swatches: [
      "bg-red-50",
      "bg-red-100",
      "bg-red-200",
      "bg-red-300",
      "bg-red-400",
      "bg-red-500",
      "bg-red-600",
      "bg-red-700",
      "bg-red-800",
      "bg-red-900",
    ],
  },
  {
    name: "charcoal",
    swatches: [
      "bg-charcoal-50",
      "bg-charcoal-100",
      "bg-charcoal-200",
      "bg-charcoal-300",
      "bg-charcoal-400",
      "bg-charcoal-500",
      "bg-charcoal-600",
      "bg-charcoal-700",
      "bg-charcoal-800",
      "bg-charcoal-900",
      "bg-charcoal-950",
    ],
  },
];

const semanticTokens = [
  { token: "background", swatch: "bg-background" },
  { token: "surface", swatch: "bg-surface" },
  { token: "surface-muted", swatch: "bg-surface-muted" },
  { token: "border", swatch: "bg-border" },
  { token: "foreground", swatch: "bg-foreground" },
  { token: "muted", swatch: "bg-muted" },
  { token: "primary", swatch: "bg-primary" },
  { token: "primary-subtle", swatch: "bg-primary-subtle" },
  { token: "danger", swatch: "bg-danger" },
  { token: "danger-subtle", swatch: "bg-danger-subtle" },
  { token: "warning", swatch: "bg-warning" },
  { token: "sidebar-active", swatch: "bg-sidebar-active" },
];

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-6 shadow-card">
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-5">{children}</div>
    </section>
  );
}

export default function ThemePreviewPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Design tokens
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Theme preview
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Every colour below resolves through a CSS variable defined in{" "}
          <code className="font-mono text-xs">globals.css</code>, so a token can
          be retuned in one place and the whole dashboard follows.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <Section
          title="Brand scales"
          description="Raw palette. Reach for these only when a semantic token is too blunt."
        >
          <div className="flex flex-col gap-4">
            {brandScales.map((scale) => (
              <div key={scale.name}>
                <p className="mb-2 font-mono text-xs text-muted">{scale.name}</p>
                <div className="flex overflow-hidden rounded-control border border-border">
                  {scale.swatches.map((swatch) => (
                    <div
                      key={swatch}
                      className={`${swatch} h-12 flex-1`}
                      title={swatch.replace("bg-", "")}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Semantic tokens"
          description="What components should actually consume. Prefer these over the raw scales."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {semanticTokens.map(({ token, swatch }) => (
              <div
                key={token}
                className="flex items-center gap-3 rounded-control border border-border p-2"
              >
                <div
                  className={`${swatch} h-8 w-8 shrink-0 rounded border border-border`}
                />
                <span className="truncate font-mono text-xs text-muted">
                  {token}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Controls"
          description="The action set a dashboard table needs: primary, edit, destructive."
        >
          <div className="flex flex-wrap items-center gap-3">
            <button className="rounded-control bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover active:bg-primary-active">
              Add Homeroom
            </button>
            <button className="rounded-control bg-warning px-4 py-2 text-sm font-semibold text-warning-foreground transition-colors hover:bg-warning-hover">
              Edit
            </button>
            <button className="rounded-control bg-danger px-4 py-2 text-sm font-semibold text-danger-foreground transition-colors hover:bg-danger-hover">
              Delete
            </button>
            <button className="rounded-control border border-border-strong bg-surface px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-surface-hover">
              Cancel
            </button>
            <span className="rounded-full bg-success-subtle px-3 py-1 text-xs font-semibold text-success">
              Active
            </span>
            <span className="rounded-full bg-danger-subtle px-3 py-1 text-xs font-semibold text-danger">
              Full
            </span>
          </div>
        </Section>

        <Section
          title="Table surface"
          description="Header, borders and links as they land on a data table."
        >
          <div className="overflow-hidden rounded-control border border-border">
            <table className="w-full text-left text-sm">
              <thead className="bg-surface-muted">
                <tr className="text-xs uppercase tracking-wide text-muted">
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Grade</th>
                  <th className="px-4 py-3 font-semibold">Seats</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Abu Dhabi", "Pre-School (3-4 years)", "18 / 15"],
                  ["Ajman", "Nursery Level 4", "0 / 1"],
                  ["Fujairah", "Nursery Level 3", "12 / 14"],
                ].map(([name, grade, seats]) => (
                  <tr
                    key={name}
                    className="border-t border-border transition-colors hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3 text-foreground">{name}</td>
                    <td className="px-4 py-3 text-muted">{grade}</td>
                    <td className="px-4 py-3 font-semibold text-primary">
                      {seats}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    </div>
  );
}
