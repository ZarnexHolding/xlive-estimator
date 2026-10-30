import * as React from "react";
import { cn } from "@/lib/utils";

/** A styled native <select>: fast, accessible and keyboard-friendly in dense tables. */
function NativeSelect({ className, size = "default", ...props }: Omit<React.ComponentProps<"select">, "size"> & { size?: "sm" | "default" }) {
  return (
    <select
      data-slot="native-select"
      className={cn(
        "rounded-lg border border-input bg-background pr-7 pl-2 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30",
        size === "sm" ? "h-7 text-xs" : "h-8",
        className,
      )}
      {...props}
    />
  );
}

export { NativeSelect };
