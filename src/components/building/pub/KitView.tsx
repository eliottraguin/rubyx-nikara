import { fieldSpec, type AdKit, type CampaignVersion } from "@/lib/api/campaigns";
import { CopyButton } from "./CopyButton";

const pre = { whiteSpace: "pre-wrap", overflowWrap: "anywhere", margin: ".2rem 0 .5rem" } as const;

/** Compteur « n / limite » ; au-delà, signalé en texte (pas seulement en couleur). */
export function Counter({ n, max }: { n: number; max: number | null }) {
  if (max === null) return <span className="help">{n} caractères</span>;
  const over = n > max;
  return (
    <span className={over ? "count-bad" : "help"}>
      {n} / {max} caractères{over ? " : limite dépassée" : ""}
    </span>
  );
}

function Block({ title, copy, children }: { title: string; copy?: string; children: React.ReactNode }) {
  return (
    <section className="block" aria-label={title}>
      <h4 className="h3">{title}</h4>
      {children}
      {copy !== undefined && <CopyButton text={copy} what={title} />}
    </section>
  );
}

const list = (items: string[]) => items.map((s) => `- ${s}`).join("\n");

/** Rend un kit de campagne. Tout le texte est du contenu non fiable : rendu en TEXTE (React échappe), jamais en HTML. */
export function KitView({ kit }: { kit: AdKit }) {
  const b = kit.brief_visuel;
  return (
    <div className="kit">
      <Block title="Positionnement" copy={kit.positionnement}>
        <p style={pre}>{kit.positionnement}</p>
        <p className="help">Audience : {kit.audience_resume}</p>
      </Block>

      <Block title="Accroches" copy={kit.accroches.map((a) => a.texte).join("\n")}>
        <ul>
          {kit.accroches.map((a, i) => (
            <li key={i}>
              <span style={pre}>{a.texte}</span> <span className="pill pill-neutral">Fiche : {a.fiche}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Textes par format">
        {kit.textes.length === 0 && <p className="help">Aucun texte.</p>}
        {kit.textes.map((t) => {
          const first = fieldSpec(t.format, "");
          return (
            <div key={t.format} className="doc">
              <h5>{first.formatLabel}</h5>
              {Object.entries(t.champs).map(([field, texts]) => {
                const spec = fieldSpec(t.format, field);
                return (
                  <div key={field}>
                    <strong>{spec.fieldLabel}</strong>
                    <ul>
                      {texts.map((txt, i) => (
                        <li key={i}>
                          <span style={pre}>{txt}</span>
                          <Counter n={[...txt].length} max={spec.max} /> <CopyButton text={txt} what={`${spec.fieldLabel} ${i + 1}`} />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          );
        })}
      </Block>

      <Block
        title="Brief visuel"
        copy={`Sujet : ${b.sujet}\nStyle : ${b.style}\nTexte sur l'image : ${b.texte_image}\nFormat : ${b.format_dimensions}\nPrompt : ${b.prompt}`}
      >
        <dl className="kv">
          <div><dt>Sujet</dt><dd style={pre}>{b.sujet}</dd></div>
          <div><dt>Style</dt><dd style={pre}>{b.style}</dd></div>
          <div><dt>Texte sur l&apos;image</dt><dd style={pre}>{b.texte_image}</dd></div>
          <div><dt>Format et dimensions</dt><dd style={pre}>{b.format_dimensions}</dd></div>
          <div><dt>Prompt pour un outil d&apos;image</dt><dd style={pre}>{b.prompt}</dd></div>
        </dl>
        <p className="help">Aucune image n&apos;est générée : collez ce prompt dans l&apos;outil de votre choix.</p>
      </Block>

      <Block
        title="Plan"
        copy={`Calendrier :\n${list(kit.plan.calendrier)}\nRépartition du budget (indicative) :\n${list(kit.plan.repartition_budget)}\nIndicateurs :\n${list(kit.plan.indicateurs)}`}
      >
        {(
          [
            ["Calendrier", kit.plan.calendrier],
            ["Répartition du budget (indicative)", kit.plan.repartition_budget],
            ["Indicateurs de suivi", kit.plan.indicateurs],
          ] as const
        ).map(([label, items]) => (
          <div key={label}>
            <strong>{label}</strong>
            <ul>{items.map((s, i) => <li key={i} style={pre}>{s}</li>)}</ul>
          </div>
        ))}
      </Block>

      <Block title="Liste de contrôle avant publication" copy={list(kit.checklist.map((c) => c.label))}>
        <ul>
          {kit.checklist.map((c) => (
            <li key={c.id}>
              {c.label}
              {c.essential ? <span className="help"> (essentiel)</span> : null}
            </li>
          ))}
        </ul>
      </Block>

      <Block title="À vérifier par vous" copy={list(kit.a_verifier)}>
        {kit.a_verifier.length === 0 ? <p className="help">Rien de signalé.</p> : <ul>{kit.a_verifier.map((s, i) => <li key={i} style={pre}>{s}</li>)}</ul>}
      </Block>
    </div>
  );
}

/** Contrôles par code : réussis et échoués, texte et symbole (jamais la couleur seule). */
export function Controls({ version }: { version: CampaignVersion }) {
  const failed = version.controles.filter((c) => !c.passed);
  const ok = version.controles.length - failed.length;
  return (
    <section aria-label="Contrôles du kit" className="block">
      <h4 className="h3">Contrôles du kit</h4>
      <p className={failed.length ? "note note-warn" : "note note-ok"}>
        {ok} réussi{ok > 1 ? "s" : ""}, {failed.length} échoué{failed.length > 1 ? "s" : ""}.
      </p>
      <ul>
        {version.controles.map((c) => (
          <li key={c.id}>
            <span className={c.passed ? "pill pill-ok" : "pill pill-bad"}>{c.passed ? "Réussi" : "Échoué"}</span> {c.label}
            {c.essential ? <span className="help"> (essentiel)</span> : null}
            {!c.passed && c.detail ? <span className="help"> — {c.detail}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
