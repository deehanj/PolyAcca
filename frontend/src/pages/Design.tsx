import { Button } from "@/components/ui/Button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";

export function DesignPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border sticky top-0 bg-background/80 backdrop-blur-sm z-50">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">
            <span className="text-primary">PolyAcca</span> Design System
          </h1>
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Back to App
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 space-y-20">
        {/* Colors Section */}
        <section>
          <SectionHeader
            title="Colors"
            description="The color palette forms the foundation of our visual identity."
          />

          <div className="space-y-8">
            {/* Backgrounds */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Backgrounds
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ColorSwatch
                  name="Background"
                  value="#1a1a1a"
                  variable="--background"
                  className="bg-[var(--background)]"
                />
                <ColorSwatch
                  name="Background Alt"
                  value="#141414"
                  variable="--background-alt"
                  className="bg-[#141414]"
                />
                <ColorSwatch
                  name="Elevated"
                  value="#242424"
                  variable="--background-elevated"
                  className="bg-[#242424]"
                />
                <ColorSwatch
                  name="Hover"
                  value="#2a2a2a"
                  variable="--background-hover"
                  className="bg-[#2a2a2a]"
                />
              </div>
            </div>

            {/* Text */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Text
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <ColorSwatch
                  name="Foreground"
                  value="#fafafa"
                  variable="--foreground"
                  className="bg-[var(--foreground)]"
                  dark
                />
                <ColorSwatch
                  name="Muted"
                  value="#a1a1a1"
                  variable="--foreground-muted"
                  className="bg-[#a1a1a1]"
                  dark
                />
                <ColorSwatch
                  name="Subtle"
                  value="#737373"
                  variable="--foreground-subtle"
                  className="bg-[#737373]"
                />
              </div>
            </div>

            {/* Accent */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Accent (Cyan)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ColorSwatch
                  name="Accent"
                  value="#9de3f1"
                  variable="--accent"
                  className="bg-[var(--accent)]"
                  dark
                />
                <ColorSwatch
                  name="Accent Hover"
                  value="#b4eaf5"
                  variable="--accent-hover"
                  className="bg-[#b4eaf5]"
                  dark
                />
                <ColorSwatch
                  name="Accent Muted"
                  value="rgba(157,227,241,0.2)"
                  variable="--accent-muted"
                  className="bg-[rgba(157,227,241,0.2)] border border-primary/30"
                />
                <ColorSwatch
                  name="Accent Foreground"
                  value="#0a0a0a"
                  variable="--accent-foreground"
                  className="bg-[#0a0a0a]"
                />
              </div>
            </div>

            {/* Semantic */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Semantic
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <ColorSwatch
                  name="Success"
                  value="#22c55e"
                  variable="--color-success"
                  className="bg-[#22c55e]"
                  dark
                />
                <ColorSwatch
                  name="Warning"
                  value="#eab308"
                  variable="--color-warning"
                  className="bg-[#eab308]"
                  dark
                />
                <ColorSwatch
                  name="Error"
                  value="#ef4444"
                  variable="--color-error"
                  className="bg-[#ef4444]"
                />
                <ColorSwatch
                  name="Info"
                  value="#9de3f1"
                  variable="--color-info"
                  className="bg-[#9de3f1]"
                  dark
                />
              </div>
            </div>

            {/* Borders */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Borders
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <ColorSwatch
                  name="Border"
                  value="#2a2a2a"
                  variable="--border"
                  className="bg-[#2a2a2a]"
                />
                <ColorSwatch
                  name="Border Hover"
                  value="#3a3a3a"
                  variable="--border-hover"
                  className="bg-[#3a3a3a]"
                />
                <ColorSwatch
                  name="Border Accent"
                  value="#9de3f1"
                  variable="--border-accent"
                  className="bg-[#9de3f1]"
                  dark
                />
              </div>
            </div>
          </div>
        </section>

        {/* Typography Section */}
        <section>
          <SectionHeader
            title="Typography"
            description="Inter for body text, with a consistent size scale."
          />

          <div className="space-y-8">
            {/* Font Sizes */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Font Sizes
              </h3>
              <div className="space-y-4 bg-card border border-border rounded-lg p-6">
                <TypeSample size="text-xs" label="xs - 12px" />
                <TypeSample size="text-sm" label="sm - 14px" />
                <TypeSample size="text-base" label="base - 16px" />
                <TypeSample size="text-lg" label="lg - 18px" />
                <TypeSample size="text-xl" label="xl - 20px" />
                <TypeSample size="text-2xl" label="2xl - 24px" />
                <TypeSample size="text-3xl" label="3xl - 30px" />
                <TypeSample size="text-4xl" label="4xl - 36px" />
                <TypeSample size="text-5xl" label="5xl - 48px" />
              </div>
            </div>

            {/* Font Weights */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Font Weights
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-card border border-border rounded-lg p-4">
                  <p className="font-light text-lg">Light (300)</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-4">
                  <p className="font-normal text-lg">Normal (400)</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-4">
                  <p className="font-medium text-lg">Medium (500)</p>
                </div>
                <div className="bg-card border border-border rounded-lg p-4">
                  <p className="font-semibold text-lg">Semibold (600)</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Spacing Section */}
        <section>
          <SectionHeader
            title="Spacing"
            description="Consistent spacing scale based on 4px increments."
          />

          <div className="bg-card border border-border rounded-lg p-6 overflow-x-auto">
            <div className="flex items-end gap-2 min-w-max">
              {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24].map((size) => (
                <div key={size} className="flex flex-col items-center gap-2">
                  <div
                    className="bg-primary rounded"
                    style={{
                      width: `${size * 4}px`,
                      height: `${size * 4}px`,
                    }}
                  />
                  <span className="text-xs text-muted-foreground">{size}</span>
                  <span className="text-xs text-muted-foreground/60">
                    {size * 4}px
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Border Radius Section */}
        <section>
          <SectionHeader
            title="Border Radius"
            description="Rounded corners for a modern, friendly feel."
          />

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {[
              { name: "sm", value: "4px" },
              { name: "md", value: "8px" },
              { name: "lg", value: "12px" },
              { name: "xl", value: "16px" },
              { name: "2xl", value: "24px" },
              { name: "3xl", value: "32px" },
              { name: "full", value: "9999px" },
            ].map((radius) => (
              <div key={radius.name} className="text-center">
                <div
                  className="bg-primary h-16 w-full mb-2"
                  style={{
                    borderRadius:
                      radius.name === "full"
                        ? "9999px"
                        : `var(--radius-${radius.name})`,
                  }}
                />
                <p className="text-sm font-medium">{radius.name}</p>
                <p className="text-xs text-muted-foreground">{radius.value}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Shadows Section */}
        <section>
          <SectionHeader
            title="Shadows & Effects"
            description="Elevation and glow effects for depth and emphasis."
          />

          <div className="space-y-8">
            {/* Elevation */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Elevation
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {["sm", "md", "lg", "xl"].map((shadow) => (
                  <div
                    key={shadow}
                    className="bg-card border border-border rounded-lg p-6 text-center"
                    style={{ boxShadow: `var(--shadow-${shadow})` }}
                  >
                    <p className="font-medium">shadow-{shadow}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Glow */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Glow Effects
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                <div className="bg-card border border-primary/30 rounded-lg p-6 text-center glow-sm">
                  <p className="font-medium">glow-sm</p>
                </div>
                <div className="bg-card border border-primary/30 rounded-lg p-6 text-center glow">
                  <p className="font-medium">glow</p>
                </div>
                <div className="bg-card border border-primary/30 rounded-lg p-6 text-center glow-lg">
                  <p className="font-medium">glow-lg</p>
                </div>
              </div>
            </div>

            {/* Text glow */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Text Effects
              </h3>
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-card border border-border rounded-lg p-6">
                  <p className="text-2xl font-semibold text-primary text-glow">
                    Text Glow
                  </p>
                </div>
                <div className="bg-card border border-border rounded-lg p-6">
                  <p className="text-2xl font-semibold text-gradient-accent">
                    Gradient Text
                  </p>
                </div>
              </div>
            </div>

            {/* Glass */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Glass Effect
              </h3>
              <div className="relative h-32 rounded-lg overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-r from-primary/30 via-purple-500/30 to-pink-500/30" />
                <div className="absolute inset-4 glass rounded-lg flex items-center justify-center">
                  <p className="font-medium">Glass (backdrop-blur)</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Buttons Section */}
        <section>
          <SectionHeader
            title="Buttons"
            description="Interactive button components with multiple variants and sizes."
          />

          <div className="space-y-8">
            {/* Variants */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Variants
              </h3>
              <div className="flex flex-wrap gap-4">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="outline">Outline</Button>
                <Button variant="ghost">Ghost</Button>
                <Button variant="destructive">Destructive</Button>
              </div>
            </div>

            {/* Sizes */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                Sizes
              </h3>
              <div className="flex flex-wrap items-center gap-4">
                <Button size="sm">Small</Button>
                <Button size="md">Medium</Button>
                <Button size="lg">Large</Button>
              </div>
            </div>

            {/* States */}
            <div>
              <h3 className="text-sm font-medium text-muted-foreground mb-4">
                States
              </h3>
              <div className="flex flex-wrap gap-4">
                <Button>Default</Button>
                <Button disabled>Disabled</Button>
              </div>
            </div>
          </div>
        </section>

        {/* Cards Section */}
        <section>
          <SectionHeader
            title="Cards"
            description="Container components for grouping related content."
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Default Card</CardTitle>
                <CardDescription>
                  Basic card with standard styling.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Card content goes here.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm" variant="outline">
                  Action
                </Button>
              </CardFooter>
            </Card>

            <Card variant="elevated">
              <CardHeader>
                <CardTitle>Elevated Card</CardTitle>
                <CardDescription>With shadow elevation.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Card content goes here.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Action</Button>
              </CardFooter>
            </Card>

            <Card variant="glow">
              <CardHeader>
                <CardTitle>Glow Card</CardTitle>
                <CardDescription>With accent glow effect.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Card content goes here.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Action</Button>
              </CardFooter>
            </Card>
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-medium text-muted-foreground mb-4">
              Hoverable Cards
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card hoverable>
                <CardHeader>
                  <CardTitle>Hover Me</CardTitle>
                  <CardDescription>
                    Card with hover interaction.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Hover to see the effect.
                  </p>
                </CardContent>
              </Card>
              <Card hoverable>
                <CardHeader>
                  <CardTitle>Hover Me</CardTitle>
                  <CardDescription>
                    Card with hover interaction.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Hover to see the effect.
                  </p>
                </CardContent>
              </Card>
              <Card hoverable>
                <CardHeader>
                  <CardTitle>Hover Me</CardTitle>
                  <CardDescription>
                    Card with hover interaction.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Hover to see the effect.
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </section>

        {/* Inputs Section */}
        <section>
          <SectionHeader
            title="Inputs"
            description="Form controls for user input."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Text Input
              </h3>
              <Input placeholder="Default input" />
              <Input placeholder="Disabled input" disabled />
              <Input placeholder="Error state" error />
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-medium text-muted-foreground">
                Textarea
              </h3>
              <Textarea placeholder="Default textarea" />
              <Textarea placeholder="Error state" error />
            </div>
          </div>
        </section>

        {/* Badges Section */}
        <section>
          <SectionHeader
            title="Badges"
            description="Small status indicators and labels."
          />

          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="success">Success</Badge>
              <Badge variant="warning">Warning</Badge>
              <Badge variant="error">Error</Badge>
            </div>

            <div className="flex flex-wrap gap-3">
              <Badge size="sm">Small</Badge>
              <Badge size="md">Medium</Badge>
            </div>
          </div>
        </section>

        {/* Progress Bars Section */}
        <section>
          <SectionHeader
            title="Progress Bars"
            description="Visual indicators for betting odds and percentages."
          />

          <div className="space-y-6 max-w-md">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#22c55e]">Yes 65%</span>
                <span className="text-[#ef4444]">No 35%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden flex">
                <div className="progress-yes" style={{ width: "65%" }} />
                <div className="progress-no" style={{ width: "35%" }} />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-[#22c55e]">Yes 42%</span>
                <span className="text-[#ef4444]">No 58%</span>
              </div>
              <div className="h-2 bg-secondary rounded-full overflow-hidden flex">
                <div className="progress-yes" style={{ width: "42%" }} />
                <div className="progress-no" style={{ width: "58%" }} />
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-8 mt-20">
        <div className="max-w-6xl mx-auto px-6 text-center text-sm text-muted-foreground">
          PolyAcca Design System &bull; Built with React + Tailwind CSS
        </div>
      </footer>
    </div>
  );
}

// Helper Components

function SectionHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-semibold mb-2">{title}</h2>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function ColorSwatch({
  name,
  value,
  variable,
  className,
  dark = false,
}: {
  name: string;
  value: string;
  variable: string;
  className: string;
  dark?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div
        className={`h-20 rounded-lg border border-border ${className}`}
      />
      <div>
        <p className={`text-sm font-medium ${dark ? "" : ""}`}>{name}</p>
        <p className="text-xs text-muted-foreground font-mono">{value}</p>
        <p className="text-xs text-muted-foreground/60 font-mono">{variable}</p>
      </div>
    </div>
  );
}

function TypeSample({ size, label }: { size: string; label: string }) {
  return (
    <div className="flex items-baseline gap-4">
      <span className="text-xs text-muted-foreground w-24 shrink-0 font-mono">
        {label}
      </span>
      <p className={size}>The quick brown fox jumps over the lazy dog</p>
    </div>
  );
}

export default DesignPage;
