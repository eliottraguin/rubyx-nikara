"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { BORNES, CHAMPS, ERREURS, EXEMPLE, SECTEURS, TEXTES, TONS, type Ton } from "@/content/fiche";
import { FICHE_EXEMPLES } from "@/content/fiche-exemples";
import { ProfileError, type Fiche, type FicheValeurs, type ProfileApi } from "@/lib/api/profile";

/** Valeurs en cours de saisie : les listes sont des textes (une ligne par élément), la taille deux champs texte. */
interface Saisie {
  entreprise_nom: string;
  offre: string;
  besoin: string;
  secteurs: string[]; // identifiants cochés
  secteursAutres: string;
  zone: string;
  taille_min: string;
  taille_max: string;
  fonctions: string;
  exclusions: string;
  ton: Ton;
}

const SECTEUR_IDS = new Set(SECTEURS.map((s) => s.id));
const lines = (s: string) => s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

export function toSaisie(v: FicheValeurs): Saisie {
  return {
    entreprise_nom: v.entreprise_nom,
    offre: v.offre,
    besoin: v.besoin,
    secteurs: v.cible_secteurs.filter((s) => SECTEUR_IDS.has(s)),
    secteursAutres: v.cible_secteurs.filter((s) => !SECTEUR_IDS.has(s)).join("\n"),
    zone: v.cible_zone.join("\n"),
    taille_min: v.cible_taille ? String(v.cible_taille.effectif_min) : "",
    taille_max: v.cible_taille ? String(v.cible_taille.effectif_max) : "",
    fonctions: v.cible_fonctions.join("\n"),
    exclusions: v.exclusions.join("\n"),
    ton: v.ton,
  };
}

type Erreurs = Partial<Record<"entreprise_nom" | "offre" | "besoin" | "cible_secteurs" | "cible_zone" | "cible_taille" | "cible_fonctions" | "exclusions" | "ton", string>>;

/** Valide côté écran (le serveur revérifie). Renvoie les valeurs prêtes à envoyer, ou les erreurs par champ. */
export function validerSaisie(s: Saisie): { values: FicheValeurs; errors: Erreurs } {
  const errors: Erreurs = {};
  const nom = s.entreprise_nom.trim();
  const offre = s.offre.trim();
  const besoin = s.besoin.trim();
  if (nom.length > BORNES.nom) errors.entreprise_nom = ERREURS.tropLong(BORNES.nom);
  if (!offre) errors.offre = ERREURS.requis;
  else if (offre.length > BORNES.offre) errors.offre = ERREURS.tropLong(BORNES.offre);
  if (besoin.length > BORNES.besoin) errors.besoin = ERREURS.tropLong(BORNES.besoin);

  const listCheck = (items: string[], b: { max: number; item: number }, required: boolean): string | undefined => {
    if (!items.length) return required ? ERREURS.requis : undefined;
    if (items.length > b.max) return ERREURS.tropDElements(b.max);
    if (items.some((i) => i.length > b.item)) return ERREURS.elementLong(b.item);
    return undefined;
  };
  const secteurs = [...s.secteurs, ...lines(s.secteursAutres)];
  const zone = lines(s.zone);
  const fonctions = lines(s.fonctions);
  const exclusions = lines(s.exclusions);
  const e1 = listCheck(secteurs, BORNES.secteurs, true);
  if (e1) errors.cible_secteurs = e1;
  const e2 = listCheck(zone, BORNES.zone, true);
  if (e2) errors.cible_zone = e2;
  const e3 = listCheck(fonctions, BORNES.fonctions, false);
  if (e3) errors.cible_fonctions = e3;
  const e4 = listCheck(exclusions, BORNES.exclusions, false);
  if (e4) errors.exclusions = e4;

  let taille: FicheValeurs["cible_taille"] = null;
  const lo = s.taille_min.trim();
  const hi = s.taille_max.trim();
  if (lo || hi) {
    const a = /^\d+$/.test(lo) ? Number(lo) : NaN;
    const b = /^\d+$/.test(hi) ? Number(hi) : NaN;
    if (!lo || !hi) errors.cible_taille = ERREURS.tailleIncomplete;
    else if (![a, b].every((n) => n >= BORNES.taille.min && n <= BORNES.taille.max)) errors.cible_taille = ERREURS.taille(BORNES.taille.min, BORNES.taille.max);
    else if (a > b) errors.cible_taille = ERREURS.tailleOrdre;
    else taille = { effectif_min: a, effectif_max: b };
  }
  return {
    values: { entreprise_nom: nom, offre, besoin, cible_secteurs: secteurs, cible_zone: zone, cible_taille: taille, cible_fonctions: fonctions, exclusions, ton: s.ton },
    errors,
  };
}

const LABEL_OF: Record<keyof Erreurs, string> = {
  entreprise_nom: CHAMPS.entreprise_nom.label,
  offre: CHAMPS.offre.label,
  besoin: CHAMPS.besoin.label,
  cible_secteurs: CHAMPS.cible_secteurs.label,
  cible_zone: CHAMPS.cible_zone.label,
  cible_taille: CHAMPS.cible_taille.label,
  cible_fonctions: CHAMPS.cible_fonctions.label,
  exclusions: CHAMPS.exclusions.label,
  ton: CHAMPS.ton.label,
};
const ORDER = Object.keys(LABEL_OF) as (keyof Erreurs)[];
/** Identifiant (relatif) du premier contrôle de chaque champ, pour le lien du résumé d'erreurs. */
const FOCUS_ID: Record<keyof Erreurs, string> = {
  entreprise_nom: "nom", offre: "offre", besoin: "besoin", cible_secteurs: "secteur-0", cible_zone: "zone", cible_taille: "taille-min", cible_fonctions: "fonctions", exclusions: "exclusions", ton: "ton-0",
};

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

/**
 * Formulaire de la fiche entreprise et cible. `initial` = fiche lue sur le serveur ; `api` injectable pour les tests.
 * Tout texte saisi ou reçu est rendu comme texte (React échappe), jamais comme HTML.
 */
export function FicheForm({ initial, api, tutoriel, onSaved }: { initial: Fiche; api: ProfileApi; tutoriel: boolean; onSaved?: (f: Fiche) => void }) {
  const uid = useId().replace(/:/g, "");
  const [fiche, setFiche] = useState<Fiche>(initial);
  const [s, setS] = useState<Saisie>(() => toSaisie(initial));
  const [errors, setErrors] = useState<Erreurs>({});
  const [etat, setEtat] = useState<Etat>({ kind: "idle" });
  const [exemple, setExemple] = useState("");
  const [infoExemple, setInfoExemple] = useState("");
  const summaryRef = useRef<HTMLDivElement>(null);
  const id = useCallback((k: string) => `${uid}-${k}`, [uid]);
  const set = <K extends keyof Saisie>(k: K, v: Saisie[K]) => setS((p) => ({ ...p, [k]: v }));

  const dirty = useMemo(() => JSON.stringify(s) !== JSON.stringify(toSaisie(fiche)), [s, fiche]);
  const errorKeys = ORDER.filter((k) => errors[k]);

  useEffect(() => {
    if (errorKeys.length) summaryRef.current?.focus();
  }, [errors]); // eslint-disable-line react-hooks/exhaustive-deps -- le résumé reçoit le focus quand de nouvelles erreurs apparaissent

  const err = (k: keyof Erreurs, base: string) => ({
    "aria-invalid": errors[k] ? (true as const) : undefined,
    "aria-describedby": `${base}-aide${errors[k] ? ` ${base}-err` : ""}`,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (etat.kind === "saving") return;
    const { values, errors: errs } = validerSaisie(s);
    setErrors(errs);
    if (Object.keys(errs).length) {
      setEtat({ kind: "idle" });
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

  const busy = etat.kind === "saving";
  const nbSecteurs = s.secteurs.length + lines(s.secteursAutres).length;

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

      <Field id={id("nom")} label={CHAMPS.entreprise_nom.label} required={false} help={CHAMPS.entreprise_nom.aide} error={errors.entreprise_nom} count={`${s.entreprise_nom.length} / ${BORNES.nom}`}>
        <input id={id("nom")} type="text" maxLength={BORNES.nom + 20} autoComplete="organization" value={s.entreprise_nom} onChange={(e) => set("entreprise_nom", e.target.value)} {...err("entreprise_nom", id("nom"))} />
      </Field>

      <Field id={id("offre")} label={CHAMPS.offre.label} required help={CHAMPS.offre.aide} error={errors.offre} count={`${s.offre.length} / ${BORNES.offre}`}>
        <textarea id={id("offre")} rows={4} value={s.offre} onChange={(e) => set("offre", e.target.value)} aria-required="true" {...err("offre", id("offre"))} />
      </Field>

      <Field id={id("besoin")} label={CHAMPS.besoin.label} required={false} help={CHAMPS.besoin.aide} error={errors.besoin} count={`${s.besoin.length} / ${BORNES.besoin}`}>
        <textarea id={id("besoin")} rows={3} value={s.besoin} onChange={(e) => set("besoin", e.target.value)} {...err("besoin", id("besoin"))} />
      </Field>

      <fieldset className="field" aria-describedby={`${id("secteur")}-aide${errors.cible_secteurs ? ` ${id("secteur")}-err` : ""}`}>
        <legend>
          {CHAMPS.cible_secteurs.label}
          <Tag required />
        </legend>
        <p className="help" id={`${id("secteur")}-aide`}>
          {CHAMPS.cible_secteurs.aide} <span>{nbSecteurs} / {BORNES.secteurs.max}</span>
        </p>
        {SECTEURS.map((sec, i) => (
          <label key={sec.id} className="check" htmlFor={id(`secteur-${i}`)}>
            <input
              id={id(`secteur-${i}`)}
              type="checkbox"
              checked={s.secteurs.includes(sec.id)}
              onChange={(e) => set("secteurs", e.target.checked ? [...s.secteurs, sec.id] : s.secteurs.filter((x) => x !== sec.id))}
            />{" "}
            {sec.label}
          </label>
        ))}
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

      <Field id={id("zone")} label={CHAMPS.cible_zone.label} required help={CHAMPS.cible_zone.aide} error={errors.cible_zone}>
        <textarea id={id("zone")} rows={3} value={s.zone} onChange={(e) => set("zone", e.target.value)} aria-required="true" {...err("cible_zone", id("zone"))} />
      </Field>

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

      <fieldset className="field" aria-describedby={`${id("ton")}-aide`}>
        <legend>{CHAMPS.ton.label}</legend>
        <p className="help" id={`${id("ton")}-aide`}>
          {CHAMPS.ton.aide}
        </p>
        {TONS.map((t, i) => (
          <label key={t.id} className={`choice ${s.ton === t.id ? "choice-on" : ""}`} htmlFor={id(`ton-${i}`)}>
            <input id={id(`ton-${i}`)} type="radio" name={id("ton")} checked={s.ton === t.id} onChange={() => set("ton", t.id)} />
            <span>
              <strong>{t.label}</strong>
              <br />
              <span className="muted">{t.exemple}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="row">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? TEXTES.saving : TEXTES.save}
        </button>
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
    </form>
  );
}

