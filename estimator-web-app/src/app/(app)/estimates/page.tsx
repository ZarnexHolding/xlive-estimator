import { Suspense } from "react";
import { LoadingBlock } from "@/components/common/page-header";
import type { Metadata } from "next";
import { EstimatesList } from "@/components/estimates/estimates-list";

export const metadata: Metadata = { title: "Estimates" };

export default function Page() {
  // Browser-stored data and today's date are read at request time, inside a Suspense boundary.
  return (
    <Suspense fallback={<LoadingBlock />}>
      <EstimatesList />
    </Suspense>
  );
}
