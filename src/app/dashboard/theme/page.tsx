import { Badge } from "@/components/ui/Field";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Tailwind scans source text literally, so every class has to appear in full.
const crayons = [
  "bg-crayon-red",
  "bg-crayon-orange",
  "bg-crayon-yellow",
  "bg-crayon-green",
  "bg-crayon-teal",
  "bg-crayon-blue",
  "bg-crayon-purple",
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
  { token: "secondary", swatch: "bg-secondary" },
  { token: "accent", swatch: "bg-accent" },
  { token: "danger", swatch: "bg-danger" },
  { token: "danger-subtle", swatch: "bg-danger-subtle" },
  { token: "warning", swatch: "bg-warning" },
  { token: "success", swatch: "bg-success" },
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
    <Card className="card-soft">
      <CardContent className="p-6">
        <h2 className="font-display text-lg font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        <div className="mt-5">{children}</div>
      </CardContent>
    </Card>
  );
}

export default function ThemePreviewPage() {
  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Design tokens
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-foreground">
          Theme preview
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Every colour below resolves through a CSS variable defined in{" "}
          <code className="font-mono text-xs">globals.css</code>, so a token can
          be retuned in one place and the whole dashboard follows.
        </p>
      </header>

      <div className="flex flex-col gap-6">
        <Section
          title="Crayon palette"
          description="The accent colours from the Letters & Numbers logo. Reach for these only when a semantic token is too blunt."
        >
          <div className="flex overflow-hidden rounded-control border border-border">
            {crayons.map((swatch) => (
              <div
                key={swatch}
                className={`${swatch} h-12 flex-1`}
                title={swatch.replace("bg-", "")}
              />
            ))}
          </div>
        </Section>

        <Section
          title="Semantic tokens"
          description="What components should actually consume. Prefer these over the raw palette."
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
          description="The shared Button variants plus status badges."
        >
          <div className="flex flex-wrap items-center gap-3">
            <Button>Add Homeroom</Button>
            <Button
              size="sm"
              className="bg-warning text-warning-foreground hover:bg-warning-hover"
            >
              Edit
            </Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="outline">Cancel</Button>
            <Button variant="ghost">Ghost</Button>
            <Badge tone="success">Active</Badge>
            <Badge tone="danger">Full</Badge>
            <Badge tone="warning">Invited</Badge>
          </div>
        </Section>

        <Section
          title="Table surface"
          description="Header, borders and links as they land on a data table."
        >
          <div className="card-soft overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-muted text-xs uppercase tracking-wide text-muted hover:bg-surface-muted">
                  <TableHead className="px-4 py-3 font-semibold">Name</TableHead>
                  <TableHead className="px-4 py-3 font-semibold">Grade</TableHead>
                  <TableHead className="px-4 py-3 font-semibold">Seats</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["Abu Dhabi", "Pre-School (3-4 years)", "18 / 15"],
                  ["Ajman", "Nursery Level 4", "0 / 1"],
                  ["Fujairah", "Nursery Level 3", "12 / 14"],
                ].map(([name, grade, seats]) => (
                  <TableRow key={name}>
                    <TableCell className="px-4 py-3 text-foreground">{name}</TableCell>
                    <TableCell className="px-4 py-3 text-muted">{grade}</TableCell>
                    <TableCell className="px-4 py-3 font-semibold text-primary">
                      {seats}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Section>
      </div>
    </div>
  );
}
