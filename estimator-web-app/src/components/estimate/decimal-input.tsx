"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { parseDecimalInput } from "@/domain/money";
import { cn } from "@/lib/utils";

/**
 * Text input for a decimal value that commits on blur or Enter. Invalid input is
 * rejected with a message and reverted; an empty field commits null (never 0).
 */
export function DecimalInput({
  value,
  onCommit,
  className,
  placeholder,
  disabled,
  allowNull = true,
  "aria-label": ariaLabel,
}: {
  value: string | null;
  onCommit: (value: string | null) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  allowNull?: boolean;
  "aria-label": string;
}) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? value ?? "";

  const commit = () => {
    if (text === null) return;
    const parsed = parseDecimalInput(text);
    if (text.trim() !== "" && parsed === null) {
      toast.error(`"${text}" is not a valid number.`);
    } else if (parsed?.startsWith("-")) {
      toast.error("Negative values are not allowed.");
    } else if (parsed === null && !allowNull) {
      toast.error("A value is required.");
    } else if (parsed !== value) {
      onCommit(parsed);
    }
    setText(null);
  };

  return (
    <Input
      inputMode="decimal"
      value={shown}
      disabled={disabled}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setText(null);
      }}
      className={cn("h-7 px-2 text-right font-mono text-sm tabular-nums", className)}
    />
  );
}
