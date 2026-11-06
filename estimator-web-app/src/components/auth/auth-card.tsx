import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AuthCard({ title, description, children }: { title: string; description?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-full items-center justify-center bg-muted/40 px-4 py-12">
      <div className="absolute top-3 right-3">
        <ThemeToggle iconOnly />
      </div>
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-lg font-semibold tracking-[0.3em]">XLIVE</p>
          <p className="text-xs text-muted-foreground">Estimator · XLive Production</p>
        </div>
        <div className="space-y-4 rounded-xl border bg-background p-6 shadow-sm">
          <div className="space-y-1">
            <h1 className="text-lg font-semibold">{title}</h1>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
