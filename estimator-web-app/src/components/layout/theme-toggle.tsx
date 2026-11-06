"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";

/**
 * Switches between the light and dark themes; next-themes remembers the choice in this browser.
 * The icon and label come from CSS (`dark:`), so the server-rendered HTML always matches.
 */
export function ThemeToggle({ iconOnly = false }: { iconOnly?: boolean }) {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size={iconOnly ? "icon-sm" : "xs"}
      aria-label="Switch between light and dark theme"
      title="Switch between light and dark theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Moon className="dark:hidden" aria-hidden />
      <Sun className="hidden dark:block" aria-hidden />
      {!iconOnly && (
        <>
          <span className="dark:hidden">Dark theme</span>
          <span className="hidden dark:inline">Light theme</span>
        </>
      )}
    </Button>
  );
}
