"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";
import { buildingHref, type FloorId } from "@/game/building/floors";
import { BotList, BuildingStatus, PlanetList } from "@/components/map/AccessibleLayer";
import { AgentsPanel } from "@/components/map/AgentsPanel";
import { BasePanel } from "@/components/map/BasePanel";
import { useTrips, usePlanetAttempts } from "@/components/map/hooks";
import { MapHost } from "@/components/map/MapHost";
import { PlanetDetail } from "@/components/map/PlanetDetail";
import { AgentsSummary, PlanetPanel } from "@/components/map/PlanetPanel";
import { SidePanel } from "@/components/map/SidePanel";
import { Loading, Notice } from "@/components/ui";
import { botLine } from "@/game/map/bots";
import { MapBus } from "@/game/map/bus";
import { levelUpMessage } from "@/game/map/building";
import { planetAttempt } from "@/game/map/dispatch";
import { mergeCurrentAttempt } from "@/game/map/history";
import { tripFrame, type TripPhase } from "@/game/map/trips";
import { buildMapViewModel, instructionsRemaining, modeLabel } from "@/game/map/viewmodel";
import { ApiError, type AttemptView, type GameState, type RoleId } from "@/lib/api/types";
import { ROLE_LABEL, money } from "@/lib/format";
import { useGame } from "@/lib/game-context";
import { SafeMarkdown } from "@/lib/markdown";

/** Largeur du panneau latéral en surimpression (28 rem à 16 px) : la caméra la déduit de son cadrage. */
const PANEL_WIDTH = 448;

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(cb: () => void): () => void {
  const mq = window.matchMedia(REDUCED_QUERY);
  mq.addEventListener("change", cb);
  // Le réglage manuel de l'interface (AppShell) pose data-motion sur <html>.
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-motion"] });
  return () => {
    mq.removeEventListener("change", cb);
    mo.disconnect();
  };
}

const motionSnapshot = () => window.matchMedia(REDUCED_QUERY).matches || document.documentElement.dataset.motion === "off";

/** Réduction des animations : préférence système OU réglage manuel de l'interface. */
function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, motionSnapshot, () => false);
}

type View = "carte" | "liste";

interface Report {
  key: string;
  planetId: string;
  planetName: string;
  attemptNo: number;
  attemptId: string;
  score: number;
  passed: boolean;
  payment: number;
  feedback: string;
}

export function MapScreen() {
  const { state } = useGame();
  if (state === undefined) return <Loading label="Chargement de votre partie…" />;
  return <MapView state={state} />;
}

function setUrlPlanet(id: string | null) {
  try {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("planete", id);
    else url.searchParams.delete("planete");
    window.history.replaceState(null, "", url.pathname + url.search);
  } catch {
    /* URL non modifiable : ignoré */
  }
}

function MapView({ state }: { state: GameState | null }) {
  const { api, mutate, busy } = useGame();
  const router = useRouter();
  const vm = useMemo(() => buildMapViewModel(state), [state]);
  const reduced = useReducedMotion();
  const [bus] = useState(() => {
    const b = new MapBus();
    b.vm = vm;
    b.reducedMotion = reduced;
    return b;
  });
  const [view, setView] = useState<View>("carte");
  const [ready, setReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapKey, setMapKey] = useState(0);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [placesOpen, setPlacesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [constructing, setConstructing] = useState(false);
  const [live, setLive] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const focusRef = useRef<string | null>(null);
  const lastFocusEl = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const panelHeadRef = useRef<HTMLHeadingElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Annonce (région aria-live) des planètes qui viennent d'être débloquées : état « précédent » gardé pendant le rendu.
  const sig = vm.planets.map((p) => `${p.id}:${p.status}`).join("|");
  const [prevSig, setPrevSig] = useState(sig);
  if (sig !== prevSig) {
    setPrevSig(sig);
    const before = new Map(prevSig.split("|").map((s) => s.split(":") as [string, string]));
    const unlocked = vm.planets.filter((p) => before.get(p.id) === "locked" && p.status !== "locked");
    if (unlocked.length) setLive(`${unlocked.map((p) => p.title).join(", ")} ${unlocked.length > 1 ? "sont maintenant disponibles" : "est maintenant disponible"}.`);
  }
  // Montée de niveau de l'immeuble (niveau lu dans l'état serveur) : annonce texte, aussi en animations réduites.
  const [prevLevel, setPrevLevel] = useState(vm.building.level);
  if (vm.building.level !== prevLevel) {
    setPrevLevel(vm.building.level);
    const msg = levelUpMessage(prevLevel, vm.building.level);
    if (msg) setLive(msg);
  }

  const vmRef = useRef(vm);
  useEffect(() => {
    vmRef.current = vm;
    bus.setVM(vm);
  }, [bus, vm]);
  useEffect(() => {
    bus.setReducedMotion(reduced);
  }, [bus, reduced]);

  // ───────────── Voyages des agents ─────────────
  const tc = useTrips(state, vm, reduced);
  useEffect(() => {
    bus.setTrips(tc.trips);
  }, [bus, tc.trips]);

  // Annonces des changements d'état des bots (en route, sur place, retour, panne) pour les lecteurs d'écran.
  const phaseRef = useRef(new Map<string, { phase: string; role: RoleId; planetId: string }>());
  useEffect(() => {
    const msgs: string[] = [];
    const placeOf = (id: string) => vmRef.current.places.find((p) => p.id === id) ?? null;
    const say = (phase: TripPhase, role: RoleId, planetId: string) => {
      const p = placeOf(planetId);
      if (phase === "home") msgs.push(`${ROLE_LABEL[role]} est rentré au garage.`);
      else msgs.push(`${botLine(role, phase, p ? { name: p.placeName, vehicle: p.vehicle } : null).text}.`);
    };
    const seen = new Set<string>();
    for (const t of tc.trips) {
      seen.add(t.id);
      const ph = tripFrame(t, tc.now, reduced).phase;
      const prev = phaseRef.current.get(t.id);
      if (prev?.phase !== ph) {
        phaseRef.current.set(t.id, { phase: ph, role: t.role, planetId: t.planetId });
        say(ph, t.role, t.planetId);
      }
    }
    for (const [id, p] of phaseRef.current) {
      if (seen.has(id)) continue;
      if (p.phase !== "home") say("home", p.role, p.planetId);
      phaseRef.current.delete(id);
    }
    if (msgs.length) setLive(msgs.join(" "));
  }, [tc.trips, tc.now, reduced]);

  // ───────────── Vue planète / base ─────────────
  const openFocus = useCallback(
    (id: string) => {
      if (id !== "base" && !vmRef.current.planets.some((p) => p.id === id)) return;
      if (!focusRef.current && document.activeElement instanceof HTMLElement) lastFocusEl.current = document.activeElement;
      focusRef.current = id;
      setFocusId(id);
      setMenuOpen(false);
      bus.setSelected(id === "base" ? null : id);
      // Le panneau se superpose à droite : la caméra décale son cadrage de sa largeur.
      bus.setInsetRight(window.innerWidth >= 900 ? Math.min(PANEL_WIDTH, window.innerWidth) : 0);
      bus.emit("view:enter", id);
      const name = id === "base" ? "votre immeuble" : (vmRef.current.planets.find((p) => p.id === id)?.title ?? id);
      setLive(`Vue de ${id === "base" ? name : `ce lieu : ${name}`} : détails, historique et bots.`);
      setUrlPlanet(id);
    },
    [bus],
  );

  /** Entrer dans l'immeuble : la vue « Immeuble » (étages) est une route à part, au clavier comme à la souris. */
  const enterBuilding = useCallback(
    (floor?: FloorId) => {
      setMenuOpen(false);
      router.push(buildingHref(floor));
    },
    [router],
  );

  const closeFocus = useCallback(() => {
    if (!focusRef.current) return;
    focusRef.current = null;
    setFocusId(null);
    setSheetOpen(false);
    bus.setSelected(null);
    bus.setInsetRight(0);
    bus.emit("view:leave");
    setLive("Retour à la ville.");
    setUrlPlanet(null);
    const el = lastFocusEl.current;
    lastFocusEl.current = null;
    // Le focus revient là où il était (liste, bouton) ou, à défaut, sur la carte.
    requestAnimationFrame(() => (el && document.contains(el) ? el : stageRef.current)?.focus());
  }, [bus]);

  useEffect(() => {
    const offs = [
      bus.on("planet:select", (id) => {
        if (id === "base") enterBuilding();
        else if (id) openFocus(id);
      }),
      bus.on("scene:ready", () => setReady(true)),
      bus.on("building:construction", setConstructing),
    ];
    return () => offs.forEach((off) => off());
  }, [bus, openFocus, enterBuilding]);

  // Lien direct (?planete=annuaire) : ouvre la vue une fois la carte prête.
  useEffect(() => {
    if (!ready) return;
    const id = new URLSearchParams(window.location.search).get("planete");
    if (id && !focusRef.current) openFocus(id);
  }, [ready, openFocus]);
  useEffect(() => {
    if (view === "liste" && !ready) {
      const id = new URLSearchParams(window.location.search).get("planete");
      if (id && !focusRef.current) openFocus(id);
    }
  }, [view, ready, openFocus]);

  // Touche H : recentrer sur votre immeuble (hors champ de saisie).
  useEffect(() => {
    if (view !== "carte") return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.key !== "h" && e.key !== "H") || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof HTMLElement && (["TEXTAREA", "INPUT", "SELECT"].includes(t.tagName) || t.isContentEditable)) return;
      e.preventDefault();
      bus.emit("camera:reset");
      setLive("Caméra recentrée sur votre immeuble.");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [bus, view]);

  // Échap : retour à la ville (sauf dans un champ de saisie, pour ne pas perdre un texte en cours).
  useEffect(() => {
    if (!focusId) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target;
      if (t instanceof HTMLElement && ["TEXTAREA", "INPUT", "SELECT"].includes(t.tagName)) return;
      e.preventDefault();
      closeFocus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId, closeFocus]);

  // Le titre du panneau reçoit le focus à l'ouverture (annonce et navigation au clavier).
  useEffect(() => {
    if (!focusId) return;
    (panelHeadRef.current ?? (focusId !== "base" ? headingRef.current : null))?.focus({ preventScroll: true });
  }, [focusId]);

  const planet = focusId && focusId !== "base" ? (vm.planets.find((p) => p.id === focusId) ?? null) : null;

  // ───────────── Données de la planète ouverte ─────────────
  const cur = state?.attempt ?? null;
  const dataSig = `${cur?.id}:${cur?.messages.length}:${cur?.status}:${cur?.submission?.status}:${cur?.artifacts.length}:${state?.balance.booked}`;
  const fetched = usePlanetAttempts(api, planet?.missionId ?? null, dataSig);
  const attempts: AttemptView[] = useMemo(() => mergeCurrentAttempt(fetched.attempts, cur, planet?.missionId ?? null), [fetched.attempts, cur, planet?.missionId]);
  const active = planet ? planetAttempt(planet, cur, attempts) : null;

  // ───────────── Actions ─────────────
  const dispatchAgent = useCallback(
    async (input: { role: RoleId; text: string; docIds: string[] }): Promise<ApiError | null> => {
      if (!planet || !state) return new ApiError("INVALID_STATE", "Aucun lieu ouvert.");
      // Le voyage visuel part au clic ; il est annulé si le serveur refuse l'envoi.
      const tripId = tc.launch(planet.id, input.role);
      let attempt = planetAttempt(planet, state.attempt, attempts);
      if (!attempt || attempt.status !== "ACTIVE") {
        const retry = planet.missionStatus === "FAILED" || planet.missionStatus === "COMPLETED";
        const missionId = planet.missionId;
        if (!missionId) {
          tc.drop(tripId);
          return new ApiError("INVALID_STATE", "Ce lieu n'est pas ouvrable pour le moment.");
        }
        const opened = await mutate((a) => (retry ? a.retryMission(missionId) : a.startMission(missionId)));
        if (!opened.ok) {
          tc.drop(tripId);
          return opened.error;
        }
        attempt = opened.result.state.attempt;
        if (!attempt || attempt.mission_id !== missionId) {
          tc.drop(tripId);
          return new ApiError("INVALID_STATE", "L'expédition n'a pas pu être ouverte.");
        }
      }
      const quota = attempt.roles.find((r) => r.role === input.role);
      const cost = quota ? (quota.free_credit ? 0 : quota.next_cost_max) : 0;
      const attemptId = attempt.id;
      const sent = await mutate((a) => a.sendMessage(attemptId, { role: input.role, text: input.text, document_ids: input.docIds, max_cost_confirmed: cost }));
      if (!sent.ok) {
        tc.drop(tripId);
        return sent.error;
      }
      tc.bind(tripId, sent.result.action);
      return null;
    },
    [planet, state, attempts, mutate, tc],
  );

  const buyAgent = useCallback(
    async (role: RoleId): Promise<ApiError | null> => {
      const r = await mutate((a) => a.purchaseAgent(role));
      if (r.ok) setLive(`${ROLE_LABEL[role]} rejoint votre garage.`);
      return r.ok ? null : r.error;
    },
    [mutate],
  );

  const deliver = useCallback(
    async (attempt: AttemptView, versionId: string): Promise<ApiError | null> => {
      const r = await mutate((a) => a.submit(attempt.id, { artifact_version_id: versionId, brief_version: attempt.brief.version }));
      if (!r.ok) return r.error;
      setLive("Rapport livré : le serveur l'évalue.");
      return null;
    },
    [mutate],
  );

  // Rapport d'expédition sur la carte : dès qu'une évaluation arrive (livraison depuis la carte ou ailleurs).
  const evalKey = cur?.submission?.evaluation ? `${cur.id}:${cur.submission.id}` : null;
  const lastEval = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (lastEval.current === undefined) {
      lastEval.current = evalKey; // première lecture : l'existant n'est pas « nouveau »
      return;
    }
    if (!evalKey || evalKey === lastEval.current || !cur?.submission?.evaluation) {
      lastEval.current = evalKey;
      return;
    }
    lastEval.current = evalKey;
    const ev = cur.submission.evaluation;
    const p = vmRef.current.planets.find((x) => x.missionId === cur.mission_id);
    if (!p) return;
    setReport({ key: evalKey, planetId: p.id, planetName: p.title, attemptNo: cur.attempt_no, attemptId: cur.id, score: ev.score, passed: ev.passed, payment: ev.payment.credited, feedback: ev.client_feedback });
    setLive(`Retour d'expédition à ${p.title} : score ${ev.score} sur 100${ev.payment.credited > 0 ? `, ${ev.payment.credited} dollars crédités` : ""}.`);
    if (ev.payment.credited > 0) bus.emit("reward", p.id, ev.payment.credited);
  }, [evalKey, cur, bus]);

  const showMap = view === "carte" && !mapError;

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.target !== e.currentTarget) return; // ne pas voler les touches des boutons internes
    const step = 80;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => bus.emit("camera:pan", -step, 0),
      ArrowRight: () => bus.emit("camera:pan", step, 0),
      ArrowUp: () => bus.emit("camera:pan", 0, -step),
      ArrowDown: () => bus.emit("camera:pan", 0, step),
      "+": () => bus.emit("camera:zoom", 1.25),
      "=": () => bus.emit("camera:zoom", 1.25),
      "-": () => bus.emit("camera:zoom", 0.8),
      "0": () => bus.emit("camera:reset"),
      Escape: () => (menuOpen ? setMenuOpen(false) : closeFocus()),
    };
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  }

  const sentCount = planet ? new Set(tc.trips.filter((t) => t.planetId === planet.id).map((t) => t.role)).size : 0;
  const open = focusId !== null;
  const ownedRoles = (state?.agents ?? []).filter((a) => a.owned).map((a) => a.role);
  const left = instructionsRemaining(state);
  const toggleList = () => setView(view === "carte" ? "liste" : "carte");

  const noticeMaquette =
    vm.source === "maquette" ? (
      <Notice tone="info" title="Aperçu de la ville (maquette).">
        Aucune partie en cours : les lieux sont figés. <Link href="/creer">Créer une entreprise</Link> pour jouer.
      </Notice>
    ) : null;

  const detail =
    planet && state ? (
      <PlanetDetail
        ref={headingRef}
        planet={planet}
        attempts={attempts}
        loading={fetched.loading && attempts.length === 0}
        loadError={fetched.error}
        onReload={fetched.reload}
        active={active}
        busy={busy}
        onDeliver={deliver}
      />
    ) : null;

  const agentsPanel =
    planet && state ? (
      <AgentsPanel
        // Réinitialise le formulaire en changeant de lieu.
        key={planet.id}
        state={state}
        planet={planet}
        attempt={active}
        trips={tc.trips}
        now={tc.now}
        reduced={reduced}
        busy={busy}
        onDispatch={dispatchAgent}
        onBuy={buyAgent}
        onOpenBase={() => enterBuilding("accueil")}
      />
    ) : null;

  const reportCard = report ? (
    <section className="map-report" role="region" aria-label="Rapport d'expédition">
      <h2 className="h4">Retour d&apos;expédition : {report.planetName}</h2>
      <p>
        Score <strong>{report.score} / 100</strong> — {report.passed ? "réussie" : "à retravailler"}.{" "}
        {report.payment > 0 ? <strong>+{money(report.payment)} au coffre.</strong> : "Aucun gain crédité."}
      </p>
      {report.feedback ? (
        <div className="report-feedback">
          <SafeMarkdown text={report.feedback} />
        </div>
      ) : null}
      <div className="row">
        <button
          type="button"
          className="btn btn-small btn-primary"
          onClick={() => {
            openFocus(report.planetId);
            setSheetOpen(false);
            requestAnimationFrame(() => document.getElementById("planet-history")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" }));
            setReport(null);
          }}
        >
          Voir dans l&apos;historique
        </button>
        <button type="button" className="btn btn-small" onClick={() => setReport(null)}>
          Fermer
        </button>
      </div>
      <p className="help report-links">
        Écran détaillé (secondaire) : <Link href={`/retour/${report.attemptId}`}>retour du client</Link>
      </p>
    </section>
  ) : null;

  const live$ = (
    <div className="sr-only" role="status" aria-live="polite">
      {live}
    </div>
  );

  // ───────────── Mode liste (repli sans la ville) ─────────────
  if (!showMap) {
    return (
      <div className="page wide map-page">
        <div className="map-head">
          <h1>{vm.company ? `Ville : ${vm.company}` : "Ville"}</h1>
          <div className="row">
            {open ? (
              <button type="button" className="btn btn-small btn-primary" onClick={closeFocus} aria-keyshortcuts="Escape">
                ← Retour à la liste
              </button>
            ) : null}
            <button type="button" className="btn btn-small" aria-pressed={view === "liste"} onClick={toggleList}>
              Afficher la ville
            </button>
          </div>
        </div>
        {noticeMaquette}
        {mapError ? (
          <Notice tone="warn" title="La ville n'a pas pu se charger.">
            Le jeu reste jouable avec la liste des lieux ci-dessous.{" "}
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setMapError(null);
                setReady(false);
                setMapKey((k) => k + 1);
                setView("carte");
              }}
            >
              Réessayer
            </button>
          </Notice>
        ) : null}
        <div className={`map-layout map-layout-list ${open ? "planet-open" : ""}`}>
          <div className="map-main">{detail}</div>
          {open && state ? (
            <SidePanel
              title={planet ? `Bots vers ${planet.title}` : "Votre immeuble : garage et coffre"}
              summary={planet ? (sentCount > 0 ? `${sentCount} en mission` : "Envoyer un bot") : money(state.balance.available)}
              open={sheetOpen}
              onToggle={() => setSheetOpen((o) => !o)}
            >
              {planet ? agentsPanel : <BasePanel state={state} busy={busy} onBuy={buyAgent} />}
            </SidePanel>
          ) : (
            <div className="map-side">
              <PlanetPanel planet={null} vm={vm} />
              <BuildingStatus vm={vm} onEnter={() => enterBuilding()} />
              <PlanetList vm={vm} selectedId={null} onSelect={openFocus} />
              <BotList vm={vm} ownedRoles={ownedRoles} trips={tc.trips} now={tc.now} reduced={reduced} />
              <AgentsSummary vm={vm} />
            </div>
          )}
        </div>
        {live$}
      </div>
    );
  }

  // ───────────── Ville plein écran ─────────────
  const panelTitle = planet ? planet.title : "Votre immeuble : garage et coffre";
  return (
    <div className={`map-fullscreen ${open ? "panel-open" : ""}`}>
      <div
        ref={stageRef}
        className="map-stage"
        tabIndex={0}
        role="group"
        aria-label="Ville du jeu, plein écran. Flèches : déplacer. Plus et moins : zoomer. H ou zéro : recentrer sur votre immeuble. Échap : revenir à la ville. Le menu et la liste des lieux offrent les mêmes actions."
        onKeyDown={onKeyDown}
      >
        <MapHost key={mapKey} bus={bus} onError={setMapError} />
        {!ready ? (
          <div className="map-loading" role="status">
            Chargement de la ville…
          </div>
        ) : null}

        <div className="map-hud" aria-label="Barre d'état">
          <button type="button" className="hud-chip hud-btn" onClick={() => enterBuilding("accueil")} aria-label={`Coffre : ${vm.treasury === null ? "inconnu" : money(vm.treasury)}. Ouvrir votre immeuble.`}>
            <span className="hud-label">Coffre</span> <strong>{vm.treasury === null ? "—" : money(vm.treasury)}</strong>
          </button>
          {left !== null ? (
            <span className="hud-chip" aria-label={`${left} instruction${left > 1 ? "s" : ""} restante${left > 1 ? "s" : ""} sur l'expédition en cours`}>
              <span className="hud-label">Instructions</span> <strong>{left}</strong>
            </span>
          ) : null}
          <button type="button" className="hud-chip hud-btn" onClick={() => enterBuilding("accueil")} aria-label="Garage : ouvrir votre immeuble.">
            <span className="hud-label">Garage</span> <strong>{vm.source === "serveur" ? `${vm.base.agentsOwned}/${vm.base.agentsTotal}` : "—"}</strong>
          </button>
          <span className="hud-chip" title={vm.simulated ? "Les réponses des bots et des lieux sont simulées" : "Données réelles"}>
            <span className="hud-label">Mode</span> <strong>{modeLabel(state?.session?.mode)}</strong>
            {vm.simulated ? <span className="hud-sim"> · simulé</span> : null}
          </span>
          {planet ? (
            <span className="hud-chip hud-view">
              <span className="hud-label">Vue</span> <strong>{planet.placeName}</strong>
            </span>
          ) : null}
        </div>

        <div className="map-menu">
          <button type="button" className="hud-chip hud-btn" aria-expanded={menuOpen} aria-controls="city-menu" onClick={() => setMenuOpen((o) => !o)}>
            Menu
          </button>
          {menuOpen ? (
            <nav id="city-menu" className="map-menu-list" aria-label="Menu de la ville">
              <ul>
                <li>
                  <button type="button" onClick={() => enterBuilding()}>
                    Entrer dans votre immeuble
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    aria-pressed={placesOpen}
                    onClick={() => {
                      setPlacesOpen((o) => !o);
                      setMenuOpen(false);
                    }}
                  >
                    Lieux et bots (liste)
                  </button>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      bus.emit("camera:reset");
                      setMenuOpen(false);
                      setLive("Caméra recentrée sur votre immeuble.");
                    }}
                  >
                    Recentrer sur le siège (H)
                  </button>
                </li>
                <li>
                  <Link href="/carnet">Carnet et bilan</Link>
                </li>
                <li>
                  <Link href="/boutique">Boutique</Link>
                </li>
                <li>
                  <button type="button" onClick={toggleList}>
                    Afficher en liste (sans la ville)
                  </button>
                </li>
              </ul>
            </nav>
          ) : null}
        </div>

        {vm.source === "maquette" ? (
          <div className="map-maquette hud-chip hud-warn" role="note">
            Aperçu maquette : <Link href="/creer">créer une entreprise</Link> pour jouer.
          </div>
        ) : null}

        {placesOpen ? (
          <aside className="map-drawer" aria-label="Lieux et bots">
            <button type="button" className="btn btn-small" onClick={() => setPlacesOpen(false)}>
              Fermer la liste
            </button>
            <PlanetList vm={vm} selectedId={planet?.id ?? null} onSelect={openFocus} />
            <BotList vm={vm} ownedRoles={ownedRoles} trips={tc.trips} now={tc.now} reduced={reduced} />
          </aside>
        ) : null}

        {focusId !== "base" ? (
          <div className="map-building">
            <BuildingStatus vm={vm} onEnter={() => enterBuilding()} constructing={constructing} onSkip={() => bus.emit("building:skip")} />
          </div>
        ) : null}

        {reportCard}

        <div className="map-tools">
          <button type="button" className="map-tool" aria-label="Zoom avant" onClick={() => bus.emit("camera:zoom", 1.3)}>
            +
          </button>
          <button type="button" className="map-tool" aria-label="Zoom arrière" onClick={() => bus.emit("camera:zoom", 0.77)}>
            −
          </button>
          <button type="button" className="map-tool map-tool-wide" aria-label="Recentrer sur votre immeuble (touche H)" onClick={() => bus.emit("camera:reset")}>
            Recentrer (H)
          </button>
        </div>

        {open && state ? (
          <aside className="city-panel" aria-label={panelTitle}>
            <div className="city-panel-head">
              <h2 className="h3" ref={panelHeadRef} tabIndex={-1}>
                {panelTitle}
              </h2>
              <button type="button" className="btn btn-small" onClick={closeFocus} aria-keyshortcuts="Escape">
                Fermer
              </button>
            </div>
            <div className="city-panel-body">
              {planet ? (
                <>
                  {agentsPanel}
                  {detail}
                </>
              ) : (
                <>
                  <BuildingStatus vm={vm} onEnter={() => enterBuilding()} constructing={constructing} onSkip={() => bus.emit("building:skip")} />
                  <BasePanel state={state} busy={busy} onBuy={buyAgent} />
                </>
              )}
            </div>
          </aside>
        ) : null}
      </div>
      {live$}
    </div>
  );
}
