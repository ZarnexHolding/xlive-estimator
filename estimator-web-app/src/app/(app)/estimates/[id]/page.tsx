import { Suspense } from "react";
import { LoadingBlock } from "@/components/common/page-header";
import { EstimateWorkspace } from "@/components/estimate/workspace";

async function Workspace({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EstimateWorkspace id={id} />;
}

export default function Page({ params }: PageProps<"/estimates/[id]">) {
  // Route params are request-time data; they are read inside a Suspense boundary.
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Workspace params={params} />
    </Suspense>
  );
}
