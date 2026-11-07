import { FeedbackScreen } from "@/screens/FeedbackScreen";

export default async function Page({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = await params;
  return <FeedbackScreen attemptId={attemptId} />;
}
