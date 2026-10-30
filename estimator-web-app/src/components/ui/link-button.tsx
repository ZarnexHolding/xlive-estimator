import Link from "next/link";
import type * as React from "react";
import { Button } from "./button";

/** A Next.js <Link> styled as a button (renders an <a>, not a <button>). */
export function LinkButton({ href, ...props }: Omit<React.ComponentProps<typeof Button>, "render" | "nativeButton"> & { href: string }) {
  return <Button nativeButton={false} render={<Link href={href} />} {...props} />;
}
