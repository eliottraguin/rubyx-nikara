import type { PlanetStatus } from "@/game/map/viewmodel";

/** Pictogramme d'état : toujours accompagné d'un libellé texte (jamais la couleur seule). */
export function StatusIcon({ status }: { status: PlanetStatus }) {
  const common = { width: 18, height: 18, viewBox: "0 0 24 24", "aria-hidden": true, focusable: false as const, className: `status-icon status-${status}` };
  switch (status) {
    case "locked":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="10" rx="2" fill="currentColor" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="2.4" />
        </svg>
      );
    case "available":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" />
          <path d="M10 8l6 4-6 4z" fill="currentColor" />
        </svg>
      );
    case "in_progress":
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="10" ry="4.5" fill="none" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="3.6" fill="currentColor" />
          <circle cx="21" cy="10" r="2" fill="currentColor" />
        </svg>
      );
    case "visited":
      return (
        <svg {...common}>
          <path d="M12 2.5l2.9 6.2 6.6.8-4.9 4.6 1.3 6.6L12 17.4 6.1 20.7l1.3-6.6L2.5 9.5l6.6-.8z" fill="currentColor" />
        </svg>
      );
  }
}
