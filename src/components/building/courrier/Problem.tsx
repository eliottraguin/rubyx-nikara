import Link from "next/link";
import { buildingHref } from "@/game/building/floors";
import type { CourrierProblem } from "./errors";

export function Problem({ problem }: { problem: CourrierProblem | null }) {
  if (!problem) return null;
  return (
    <p className="note note-warn" role="alert">
      {problem.text}
      {problem.buyAgent ? (
        <>
          {" "}
          <Link href={buildingHref("accueil")}>Aller à l&apos;Accueil et garage</Link>
        </>
      ) : null}
    </p>
  );
}
