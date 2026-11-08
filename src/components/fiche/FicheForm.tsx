"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { ASSISTANT, BORNES, CHAMPS, EXEMPLE, ETAPES, SECTEURS, TEXTES, TONS, type EtapeId } from "@/content/fiche";
import { FICHE_EXEMPLES } from "@/content/fiche-exemples";
import { ProfileError, type Fiche, type ProfileApi } from "@/lib/api/profile";
import "@/styles/fiche-wizard.css";
import {
  erreursVisibles,
  ETAPE_DU_CHAMP,
  FOCUS_ID,
  LABEL_OF,
  niveauCompletion,
  ORDER,
  toSaisie,
  validerSaisie,
  type Erreurs,
  type Saisie,
} from "./ficheWizard";

export { toSaisie, validerSaisie } from "./ficheWizard";

function Tag({ required }: { required: boolean }) {
  return <span className={required ? "fiche-req" : "muted"}> ({required ? TEXTES.obligatoire : TEXTES.facultatif})</span>;
}

function Field({ id, label, required, help, error, count, children }: { id: string; label: string; required: boolean; help: string; error?: string; count?: string; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        <Tag required={required} />
      </label>
      <p className="help" id={`${id}-aide`}>
        {help}
        {count ? <span> {count}</span> : null}
      </p>
      {children}
      {error ? (
        <p className="note note-bad" id={`${id}-err`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

type Etat = { kind: "idle" } | { kind: "saving" } | { kind: "saved"; version: number } | { kind: "conflict" } | { kind: "reloaded" } | { kind: "problem"; message: string };

const ZONE_EXEMPLES = ["Île-de-France", "Auvergne-Rhône-Alpes", "Nouvelle-Aquitaine", "Hauts-de-France", "Occitanie"];

/** Carte de visite : aperçu en direct de l'entreprise d'après la saisie en cours. Toujours du texte, jamais du HTML. */
function CarteVisite({ s }: { s: Saisie }) {
  const secteurLabel = (id: string) => SECTEURS.find((x) => x.id === id)?.label ?? id;
  const secteursAutres = s.secteursAutres.split("\n").map((l) => l.trim()).filter(Boolean);
  const secteurs = [...s.secteurs.map(secteurLabel), ...secteursAutres];
  const zone = s.zone.split("\n").map((l) => l.trim()).filter(Boolean);
  const ton = TONS.find((t) => t.id === s.ton);
  const offreApercu = s.offre.trim().length > 90 ? `${s.offre.trim().slice(0, 90)}…` : s.offre.trim();
  return (
    <aside className="bc" aria-label={ASSISTANT.carteVisite}>
      <p className="bc-eyebrow">{ASSISTANT.carteVisite}</p>
      <p className="bc-nom">{s.entreprise_nom.trim() || ASSISTANT.carteVisiteVide}</p>
      <p className="bc-offre">{offreApercu || ASSISTANT.carteVisiteVide}</p>
      {secteurs.length ? (
        <ul className="bc-chips" aria-label={CHAMPS.cible_secteurs.label}>
          {secteurs.map((lbl) => (
            <li key={lbl} className="fiche-chip">
              {lbl}
            </li>
          ))}
        </ul>
      ) : null}
      {zone.length ? <p className="bc-zone">📍 {zone.join(", ")}</p> : null}
      {ton ? (
        <p className="bc-ton">
          <span aria-hidden="true">{ton.icone}</span> {ton.label}
        </p>
      ) : null}
    </aside>
  );
}

/**
 * Formulaire de la fiche entreprise et cible, en assistant pas à pas (5 étapes courtes, UI-H1).
 * `initial` = fiche lue sur le serveur ; `api` injectable pour les tests. Tout texte saisi ou reçu est rendu comme
 * texte (React échappe), jamais comme HTML ; la saisie reste en mémoire d'une étape à l'autre, rien n'est envoyé
 * au serveur avant « Enregistrer ma fiche » (une seule version créée, comme avant l'assistant).
 */
export function FicheForm({ initial, api, tutoriel, onSaved }: { initial: Fiche; api: ProfileApi; tutoriel: boolean; onSaved?: (f: Fiche) => void }) {
  const uid = useId().replace(/:/g, "");
  const [fiche, setFiche] = useState<Fiche>(initial);
  const [s, setS] = useState<Saisie>(() => toSaisie(initial));
  const [errors, setErrors] = useState<Erreurs>({});
  const [etat, setEtat] = useState<Etat>({ kind: "idle" });
  const [etapeIdx, setEtapeIdx] = useState(0);
  const [visitees, setVisitees] = useState<ReadonlySet<EtapeId>>(() => new Set([ETAPES[0]!.id]));
  const [exemple, setExemple] = useState("");
  const [infoExemple, setInfoExemple] = useState("");
  const summaryRef = useRef<HTMLDivElement>(null);
  const titreRef = useRef<HTMLHeadingElement>(null);
  const id = useCallback((k: string) => `${uid}-${k}`, [uid]);
  const set = <K extends keyof Saisie>(k: K, v: Saisie[K]) => setS((p) => ({ ...p, [k]: v }));

  const etape = ETAPES[etapeIdx]!;
  const dirty = useMemo(() => JSON.stringify(s) !== JSON.stringify(toSaisie(fiche)), [s, fiche]);
  const errorKeys = ORDER.filter((k) => errors[k]);

  useEffect(() => {
    if (errorKeys.length) summaryRef.current?.focus();
  }, [errors]); // eslint-disable-line react-hooks/exhaustive-deps -- le résumé reçoit le focus quand de nouvelles erreurs apparaissent

  useEffect(() => {
    titreRef.current?.focus();
  }, [etapeIdx]); // le titre de l'étape reçoit le focus au changement, pour l'orientation au clavier/lecteur d'écran

  const err = (k: keyof Erreurs, base: string) => ({
    "aria-invalid": errors[k] ? (true as const) : undefined,
    "aria-describedby": `${base}-aide${errors[k] ? ` ${base}-err` : ""}`,
  });

  function allerA(i: number) {
    setEtapeIdx(i);
  }

  function suivant() {
    const { errors: errs } = validerSaisie(s);
    const nextVisitees = new Set(visitees);
    nextVisitees.add(etape.id);
    setVisitees(nextVisitees);
    setErrors(erreursVisibles(errs, nextVisitees));
    const bloque = ORDER.some((k) => ETAPE_DU_CHAMP[k] === etape.id && errs[k]);
    if (bloque) return;
    setEtapeIdx((i) => Math.min(i + 1, ETAPES.length - 1));
  }

  function precedent() {
    setEtapeIdx((i) => Math.max(i - 1, 0));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (etat.kind === "saving") return;
    const { values, errors: errs } = validerSaisie(s);
    const toutesEtapes = new Set(ETAPES.map((x) => x.id));
    setVisitees(toutesEtapes);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setEtat({ kind: "idle" });
      const premier = ORDER.find((k) => errs[k]);
      if (premier) setEtapeIdx(ETAPES.findIndex((x) => x.id === ETAPE_DU_CHAMP[premier]));
      return;
    }
    if (!dirty) {
      setEtat({ kind: "problem", message: TEXTES.unchanged });
      return;
    }
    setErrors({});
    setEtat({ kind: "saving" });
    try {
      const next = await api.save(values, fiche.version);
      setFiche(next);
      setS(toSaisie(next));
      setEtat({ kind: "saved", version: next.version });
      onSaved?.(next);
    } catch (x) {
      if (x instanceof ProfileError && x.code === "VERSION_CONFLICT") setEtat({ kind: "conflict" });
      else if (x instanceof ProfileError && x.code === "INVALID_REQUEST") {
        const mapped: Erreurs = {};
        for (const [k, m] of Object.entries(x.fields)) if (k in LABEL_OF) mapped[k as keyof Erreurs] = m;
        setErrors(mapped);
        const premier = ORDER.find((k) => mapped[k]);
        if (premier) setEtapeIdx(ETAPES.findIndex((x2) => x2.id === ETAPE_DU_CHAMP[premier]));
        setEtat(Object.keys(mapped).length ? { kind: "idle" } : { kind: "problem", message: TEXTES.unknown });
      } else if (x instanceof ProfileError && x.code === "NETWORK") setEtat({ kind: "problem", message: TEXTES.network });
      else if (x instanceof ProfileError && x.code === "SESSION_REQUIRED") setEtat({ kind: "problem", message: TEXTES.session });
      else setEtat({ kind: "problem", message: TEXTES.unknown });
    }
  }

  async function reload() {
    setEtat({ kind: "saving" });
    try {
      const next = await api.get();
      setFiche(next);
      setS(toSaisie(next));
      setErrors({});
      setEtat({ kind: "reloaded" });
      onSaved?.(next);
    } catch {
      setEtat({ kind: "problem", message: TEXTES.network });
    }
  }

  function fillExample() {
    const ex = FICHE_EXEMPLES.find((x) => x.id === exemple);
    if (!ex) return;
    setS(toSaisie(ex.valeurs));
    setErrors({});
    setEtat({ kind: "idle" });
    setInfoExemple(EXEMPLE.rempli(ex.valeurs.entreprise_nom));
  }

  function ajouterZoneExemple(valeur: string) {
    const existantes = s.zone.split("\n").map((l) => l.trim()).filter(Boolean);
    if (existantes.includes(valeur) || existantes.length >= BORNES.zone.max) return;
    set("zone", [...existantes, valeur].join("\n"));
  }

  const busy = etat.kind === "saving";
  const nbSecteurs = s.secteurs.length + s.secteursAutres.split("\n").map((l) => l.trim()).filter(Boolean).length;
  const completion = niveauCompletion(s);
  const estDerniere = etapeIdx === ETAPES.length - 1;

  return (
    <form onSubmit={(e) => void submit(e)} noValidate aria-labelledby={id("titre")}>
      <h1 id={id("titre")}>{TEXTES.title}</h1>
      <p>{TEXTES.intro}</p>
      <p className="help">
        {TEXTES.consigne} {TEXTES.texteSeul}
      </p>
      <p className="help">{TEXTES.requisLegende}</p>

      <div role="status" aria-live="polite">
        <p className={fiche.complete ? "note note-ok" : "note note-warn"}>
          {fiche.complete ? TEXTES.complete : TEXTES.incomplete} <span className="muted">{TEXTES.version(fiche.version)}.</span>
        </p>
        <div className="fiche-meter" aria-hidden="true">
          <div className="fiche-meter-bar" style={{ width: `${completion}%` }} />
        </div>
        <p className="help">{ASSISTANT.completion(completion)}</p>
      </div>

      {tutoriel ? (
        <fieldset className="card" aria-describedby={id("ex-aide")}>
          <legend>{EXEMPLE.legende}</legend>
          <p className="help" id={id("ex-aide")}>
            {EXEMPLE.aide}
          </p>
          <div className="row">
            <label htmlFor={id("ex")} className="sr-only">
              {EXEMPLE.choix}
            </label>
            <select id={id("ex")} value={exemple} onChange={(e) => setExemple(e.target.value)}>
              <option value="">{EXEMPLE.placeholder}</option>
              {FICHE_EXEMPLES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.valeurs.entreprise_nom}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-small" disabled={!exemple || busy} onClick={fillExample}>
              {EXEMPLE.bouton}
            </button>
          </div>
          <p role="status" className="help">
            {infoExemple}
          </p>
        </fieldset>
      ) : null}

      {errorKeys.length ? (
        <div className="note note-bad" role="alert" tabIndex={-1} ref={summaryRef}>
          <strong>{TEXTES.summary}</strong>
          <ul>
            {errorKeys.map((k) => (
              <li key={k}>
                <a
                  href={`#${id(FOCUS_ID[k])}`}
                  onClick={(e) => {
                    e.preventDefault();
                    setEtapeIdx(ETAPES.findIndex((x) => x.id === ETAPE_DU_CHAMP[k]));
                    document.getElementById(id(FOCUS_ID[k]))?.focus();
                  }}
                >
                  {LABEL_OF[k]}
                </a>{" "}
                : {errors[k]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ol className="fiche-progress" aria-label={TEXTES.title}>
        {ETAPES.map((e, i) => (
          <li key={e.id}>
            <button
              type="button"
              className={`fiche-progress-item ${i === etapeIdx ? "is-courante" : ""} ${i < etapeIdx ? "is-faite" : ""}`}
              aria-current={i === etapeIdx ? "step" : undefined}
              disabled={i > etapeIdx}
              onClick={() => allerA(i)}
            >
              <span className="fiche-progress-num" aria-hidden="true">
                {i < etapeIdx ? "✓" : i + 1}
              </span>
              {e.titre}
            </button>
          </li>
        ))}
      </ol>

      <div className="fiche-wizard-layout">
        <div className="fiche-step">
          <h2 id={id("etape-titre")} ref={titreRef} tabIndex={-1}>
            {ASSISTANT.etape(etapeIdx + 1, ETAPES.length)} — {etape.titre}
          </h2>
          <p className="help">{etape.aide}</p>

          {etape.id === "qui" ? (
            <Field id={id("nom")} label={CHAMPS.entreprise_nom.label} required={false} help={CHAMPS.entreprise_nom.aide} error={errors.entreprise_nom} count={`${s.entreprise_nom.length} / ${BORNES.nom}`}>
              <input id={id("nom")} type="text" maxLength={BORNES.nom + 20} autoComplete="organization" value={s.entreprise_nom} onChange={(e) => set("entreprise_nom", e.target.value)} {...err("entreprise_nom", id("nom"))} />
            </Field>
          ) : null}

          {etape.id === "vente" ? (
            <>
              <Field id={id("offre")} label={CHAMPS.offre.label} required help={CHAMPS.offre.aide} error={errors.offre} count={`${s.offre.length} / ${BORNES.offre}`}>
                <textarea id={id("offre")} rows={4} value={s.offre} onChange={(e) => set("offre", e.target.value)} aria-required="true" {...err("offre", id("offre"))} />
              </Field>
              <Field id={id("besoin")} label={CHAMPS.besoin.label} required={false} help={CHAMPS.besoin.aide} error={errors.besoin} count={`${s.besoin.length} / ${BORNES.besoin}`}>
                <textarea id={id("besoin")} rows={3} value={s.besoin} onChange={(e) => set("besoin", e.target.value)} {...err("besoin", id("besoin"))} />
              </Field>
            </>
          ) : null}

          {etape.id === "cible" ? (
            <>
              <fieldset className="field" aria-describedby={`${id("secteur")}-aide${errors.cible_secteurs ? ` ${id("secteur")}-err` : ""}`}>
                <legend>
                  {CHAMPS.cible_secteurs.label}
                  <Tag required />
                </legend>
                <p className="help" id={`${id("secteur")}-aide`}>
                  {CHAMPS.cible_secteurs.aide} <span>{nbSecteurs} / {BORNES.secteurs.max}</span>
                </p>
                <div className="fiche-secteurs-grid">
                  {SECTEURS.map((sec, i) => (
                    <label key={sec.id} className={`choice ${s.secteurs.includes(sec.id) ? "choice-on" : ""}`} htmlFor={id(`secteur-${i}`)}>
                      <input
                        id={id(`secteur-${i}`)}
                        type="checkbox"
                        checked={s.secteurs.includes(sec.id)}
                        onChange={(e) => set("secteurs", e.target.checked ? [...s.secteurs, sec.id] : s.secteurs.filter((x) => x !== sec.id))}
                      />
                      <span>
                        <span aria-hidden="true">{sec.icone}</span> {sec.label}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="field">
                  <label htmlFor={id("secteurs-autres")}>
                    {CHAMPS.secteurs_autres.label}
                    <Tag required={false} />
                  </label>
                  <p className="help" id={id("secteurs-autres-aide")}>
                    {CHAMPS.secteurs_autres.aide}
                  </p>
                  <textarea id={id("secteurs-autres")} rows={2} value={s.secteursAutres} onChange={(e) => set("secteursAutres", e.target.value)} aria-describedby={id("secteurs-autres-aide")} />
                </div>
                {errors.cible_secteurs ? (
                  <p className="note note-bad" id={`${id("secteur")}-err`}>
                    {errors.cible_secteurs}
                  </p>
                ) : null}
              </fieldset>

              <fieldset className="field" aria-describedby={`${id("taille")}-aide${errors.cible_taille ? ` ${id("taille")}-err` : ""}`}>
                <legend>
                  {CHAMPS.cible_taille.label}
                  <Tag required={false} />
                </legend>
                <p className="help" id={`${id("taille")}-aide`}>
                  {CHAMPS.cible_taille.aide}
                </p>
                <div className="row">
                  <label htmlFor={id("taille-min")}>{CHAMPS.taille_min.label}</label>
                  <input id={id("taille-min")} type="text" inputMode="numeric" style={{ width: "8rem" }} value={s.taille_min} onChange={(e) => set("taille_min", e.target.value)} aria-invalid={errors.cible_taille ? true : undefined} />
                  <label htmlFor={id("taille-max")}>{CHAMPS.taille_max.label}</label>
                  <input id={id("taille-max")} type="text" inputMode="numeric" style={{ width: "8rem" }} value={s.taille_max} onChange={(e) => set("taille_max", e.target.value)} aria-invalid={errors.cible_taille ? true : undefined} />
                </div>
                {errors.cible_taille ? (
                  <p className="note note-bad" id={`${id("taille")}-err`}>
                    {errors.cible_taille}
                  </p>
                ) : null}
              </fieldset>

              <Field id={id("fonctions")} label={CHAMPS.cible_fonctions.label} required={false} help={CHAMPS.cible_fonctions.aide} error={errors.cible_fonctions}>
                <textarea id={id("fonctions")} rows={3} value={s.fonctions} onChange={(e) => set("fonctions", e.target.value)} {...err("cible_fonctions", id("fonctions"))} />
              </Field>

              <Field id={id("exclusions")} label={CHAMPS.exclusions.label} required={false} help={CHAMPS.exclusions.aide} error={errors.exclusions}>
                <textarea id={id("exclusions")} rows={3} value={s.exclusions} onChange={(e) => set("exclusions", e.target.value)} {...err("exclusions", id("exclusions"))} />
              </Field>
            </>
          ) : null}

          {etape.id === "zone" ? (
            <Field id={id("zone")} label={CHAMPS.cible_zone.label} required help={CHAMPS.cible_zone.aide} error={errors.cible_zone}>
              <textarea id={id("zone")} rows={3} value={s.zone} onChange={(e) => set("zone", e.target.value)} aria-required="true" {...err("cible_zone", id("zone"))} />
              <div className="examples">
                {ZONE_EXEMPLES.map((z) => (
                  <button key={z} type="button" className="fiche-chip fiche-chip-btn" onClick={() => ajouterZoneExemple(z)}>
                    + {z}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}

          {etape.id === "ton" ? (
            <fieldset className="field" aria-describedby={`${id("ton")}-aide`}>
              <legend>{CHAMPS.ton.label}</legend>
              <p className="help" id={`${id("ton")}-aide`}>
                {CHAMPS.ton.aide}
              </p>
              {TONS.map((t, i) => (
                <label key={t.id} className={`choice ${s.ton === t.id ? "choice-on" : ""}`} htmlFor={id(`ton-${i}`)}>
                  <input id={id(`ton-${i}`)} type="radio" name={id("ton")} checked={s.ton === t.id} onChange={() => set("ton", t.id)} />
                  <span>
                    <strong>
                      <span aria-hidden="true">{t.icone}</span> {t.label}
                    </strong>
                    <br />
                    <span className="muted">{t.exemple}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <div className="row">
            {etapeIdx > 0 ? (
              <button type="button" className="btn btn-small" onClick={precedent}>
                {ASSISTANT.precedent}
              </button>
            ) : null}
            {!estDerniere ? (
              <button type="button" className="btn btn-primary" onClick={suivant}>
                {ASSISTANT.suivant}
              </button>
            ) : (
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? TEXTES.saving : TEXTES.save}
              </button>
            )}
            {fiche.complete ? (
              <Link className="btn" href="/carte">
                {TEXTES.goSearch}
              </Link>
            ) : null}
          </div>

          <div role="status" aria-live="polite">
            {etat.kind === "saved" ? <p className="note note-ok">{TEXTES.saved(etat.version)}</p> : null}
            {etat.kind === "reloaded" ? <p className="note note-info">{TEXTES.reloaded}</p> : null}
            {etat.kind === "problem" && etat.message === TEXTES.unchanged ? <p className="note note-info">{etat.message}</p> : null}
          </div>
          {etat.kind === "problem" && etat.message !== TEXTES.unchanged ? (
            <p className="note note-bad" role="alert">
              {etat.message}
            </p>
          ) : null}
          {etat.kind === "conflict" ? (
            <div className="note note-warn" role="alert">
              <strong>{TEXTES.conflictTitle}</strong> {TEXTES.conflictText}
              <div className="row">
                <button type="button" className="btn btn-small" onClick={() => void reload()}>
                  {TEXTES.conflictReload}
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <CarteVisite s={s} />
      </div>
    </form>
  );
}
