import { Suspense } from "react";
import { LoadingBlock } from "@/components/common/page-header";
import type { Metadata } from "next";
import { SettingsPage } from "@/components/settings/settings-page";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  // Browser-stored data and today's date are read at request time, inside a Suspense boundary.
  return (
    <Suspense fallback={<LoadingBlock />}>
      <SettingsPage />
    </Suspense>
  );
}
