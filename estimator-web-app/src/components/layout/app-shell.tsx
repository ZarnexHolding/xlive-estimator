import Link from "next/link";
import { Suspense } from "react";
import { ModeBanner } from "./mode-banner";
import { ActiveNavLinks, NavLinks } from "./nav-links";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-screen">
      <aside className="hidden w-56 shrink-0 flex-col border-r bg-background md:flex">
        <Link href="/" className="flex h-14 items-center gap-2 border-b px-5">
          <span className="text-[15px] font-semibold tracking-[0.25em]">XLIVE</span>
          <span className="text-xs text-muted-foreground">Estimator</span>
        </Link>
        <nav className="flex flex-1 flex-col gap-0.5 p-2" aria-label="Main">
          {/* The current path is request-time data: highlight it after the static shell. */}
          <Suspense fallback={<NavLinks variant="sidebar" pathname={null} />}>
            <ActiveNavLinks variant="sidebar" />
          </Suspense>
        </nav>
        <p className="border-t px-5 py-3 text-[11px] leading-snug text-muted-foreground">XLive Production · internal tool</p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <ModeBanner />
        <nav className="flex gap-1 overflow-x-auto border-b bg-background px-3 py-2 md:hidden" aria-label="Main">
          <Suspense fallback={<NavLinks variant="bar" pathname={null} />}>
            <ActiveNavLinks variant="bar" />
          </Suspense>
        </nav>
        <main className="flex-1 bg-muted/40">{children}</main>
      </div>
    </div>
  );
}
