import { Suspense } from "react";
import { LoadingBlock } from "@/components/common/page-header";
import { Dashboard } from "@/components/dashboard/dashboard";

export default function Page() {
  // Browser-stored data and today's date are read at request time, inside a Suspense boundary.
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Dashboard />
    </Suspense>
  );
}
