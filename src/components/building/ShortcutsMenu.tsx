import Link from "next/link";
import { buildingHref } from "@/game/building/floors";

/** Raccourcis des trois sections (barre principale) : Prospection, Clients, Pub. */
export const SHORTCUTS = [
  { label: "Prospection", href: "/carte" },
  { label: "Clients", href: buildingHref("courrier") },
  { label: "Pub", href: buildingHref("pub") },
] as const;

export function ShortcutsMenu({ path }: { path: string }) {
  const active = path === "/immeuble" || path.startsWith("/immeuble/");
  return (
    // `key` : le menu se referme après chaque navigation.
    <details className="nav-more" key={path}>
      <summary className={active ? "nav-more-on" : undefined}>Raccourcis</summary>
      <ul className="nav-more-list" aria-label="Raccourcis">
        {SHORTCUTS.map((s) => (
          <li key={s.href}>
            <Link href={s.href}>{s.label}</Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
