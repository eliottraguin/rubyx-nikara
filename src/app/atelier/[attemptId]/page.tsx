import { WorkshopScreen } from "@/screens/WorkshopScreen";

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <WorkshopScreen attemptId={attemptId} />;
}
