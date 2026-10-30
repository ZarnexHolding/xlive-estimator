import { Suspense } from "react";
import { LoadingBlock } from "@/components/common/page-header";
import type { Metadata } from "next";
import { NewEstimateForm } from "@/components/estimates/new-estimate-form";

export const metadata: Metadata = { title: "New estimate" };

export default function Page() {
  // Browser-stored data and today's date are read at request time, inside a Suspense boundary.
  return (
    <Suspense fallback={<LoadingBlock />}>
      <NewEstimateForm />
    </Suspense>
  );
}
