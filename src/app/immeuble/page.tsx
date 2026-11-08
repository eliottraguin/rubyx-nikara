import { BuildingScreen } from "@/screens/BuildingScreen";

type Param = string | string[] | undefined;
const first = (v: Param): string | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

export default async function Page({ searchParams }: { searchParams: Promise<{ etage?: Param; conversation?: Param }> }) {
  const { etage, conversation } = await searchParams;
  return <BuildingScreen floor={first(etage)} conversation={first(conversation)} />;
}
