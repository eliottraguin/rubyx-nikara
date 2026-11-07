import { OrderScreen } from "@/screens/OrderScreen";

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <OrderScreen attemptId={attemptId} />;
}
