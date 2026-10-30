import type { Metadata } from "next";
import { Suspense } from "react";
import { Onboarding } from "@/components/auth/onboarding";
import { LoadingBlock } from "@/components/common/page-header";

export const metadata: Metadata = { title: "Set up" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Onboarding />
    </Suspense>
  );
}
