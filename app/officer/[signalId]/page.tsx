import { Suspense } from "react";
import OfficerView from "@/components/OfficerView";

async function Junction({ params }: { params: Promise<{ signalId: string }> }) {
  const { signalId } = await params;
  return <OfficerView signalId={signalId} />;
}

export default function OfficerPage({ params }: { params: Promise<{ signalId: string }> }) {
  return (
    <Suspense fallback={<main className="page narrow"><p>Loading…</p></main>}>
      <Junction params={params} />
    </Suspense>
  );
}
