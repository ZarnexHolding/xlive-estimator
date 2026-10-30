"use client";

import { FileSpreadsheet, LayoutDashboard, Settings, Sigma, Tags } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/estimates", label: "Estimates", icon: FileSpreadsheet },
  { href: "/catalogue", label: "Price catalogue", icon: Tags },
  { href: "/rules", label: "Costing rules", icon: Sigma },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

/** Navigation links. `pathname` is null in the static fallback (no item highlighted). */
export function NavLinks({ variant, pathname }: { variant: "sidebar" | "bar"; pathname: string | null }) {
  const isActive = (href: string) => pathname !== null && (href === "/" ? pathname === "/" : pathname.startsWith(href));
  if (variant === "bar") {
    return NAV.map(({ href, label }) => (
      <Link key={href} href={href} className={cn("rounded px-2 py-1 text-sm whitespace-nowrap", isActive(href) ? "bg-muted font-medium" : "text-muted-foreground")}>
        {label}
      </Link>
    ));
  }
  return NAV.map(({ href, label, icon: Icon }) => (
    <Link
      key={href}
      href={href}
      aria-current={isActive(href) ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        isActive(href) && "bg-muted font-medium text-foreground",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {label}
    </Link>
  ));
}

export function ActiveNavLinks({ variant }: { variant: "sidebar" | "bar" }) {
  return <NavLinks variant={variant} pathname={usePathname()} />;
}
