import { PlanScreen } from "@/screens/PlanScreen";

export default async function Page({ params }: { params: Promise<{ actionId: string }> }) {
  const { actionId } = await params;
  return <PlanScreen actionId={actionId} />;
}
