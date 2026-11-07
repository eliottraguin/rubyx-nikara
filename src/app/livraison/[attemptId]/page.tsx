import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { DeliveryScreen } from "@/screens/DeliveryScreen";

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return (
    <Suspense fallback={<Loading />}>
      <DeliveryScreen attemptId={attemptId} />
    </Suspense>
  );
}
