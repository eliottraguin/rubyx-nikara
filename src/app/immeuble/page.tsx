import { BuildingScreen } from "@/screens/BuildingScreen";

export default async function Page({ searchParams }: { searchParams: Promise<{ etage?: string | string[] }> }) {
  const { etage } = await searchParams;
  return <BuildingScreen floor={Array.isArray(etage) ? (etage[0] ?? null) : (etage ?? null)} />;
}
