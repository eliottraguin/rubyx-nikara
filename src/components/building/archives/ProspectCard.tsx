import { planetDef } from "@/game/map/planets";
import { PERTINENCE } from "@/content/recherche";
import { statutLabel, type Pertinence, type Prospect } from "@/lib/api/prospects";
import { fmtDate } from "./ProspectTable";
import s from "./archives.module.css";

const GAUGE_TONE: Record<Pertinence, string> = { correspond: s["gauge-ok"]!, a_verifier: s["gauge-warn"]!, hors_cible: s["gauge-bad"]! };

function PertinenceGauge({ value }: { value: Pertinence }) {
  const p = PERTINENCE[value];
  return (
    <div className={`${s.gauge} ${GAUGE_TONE[value]}`} role="img" aria-label={`Correspondance avec votre cible : ${p.label}`} title={p.hint}>
      <span className={s.gaugeStep} aria-hidden="true" />
      <span className={s.gaugeStep} aria-hidden="true" />
      <span className={s.gaugeStep} aria-hidden="true" />
    </div>
  );
}

export function ProspectCard({
  prospect,
  selected,
  favori,
  contacting,
  isNew,
  onOpen,
  onToggleFavori,
  onContacter,
}: {
  prospect: Prospect;
  selected: boolean;
  favori: boolean;
  contacting: boolean;
  isNew: boolean;
  onOpen: (id: string) => void;
  onToggleFavori: (id: string) => void;
  onContacter: (id: string) => void;
}) {
  const lieu = planetDef(prospect.source);
  const initiale = (lieu?.name ?? prospect.source).trim().charAt(0).toUpperCase() || "?";
  return (
    <li className={isNew ? s.new : undefined}>
      <button type="button" className={s.prospectCard} aria-pressed={selected} aria-label={`Ouvrir la fiche : ${prospect.entreprise}`} onClick={() => onOpen(prospect.id)}>
        <div className={s.cardHead}>
          <span className={s.avatar} style={{ background: lieu?.palette.mid ?? "var(--muted)" }} aria-hidden="true">
            {initiale}
          </span>
          <span className={s.cardTitle}>
            <strong>{prospect.entreprise}</strong>
            <span className={s.cardMeta}>
              {lieu?.name ?? prospect.source} · {fmtDate(prospect.cree_le)}
            </span>
          </span>
        </div>
        <PertinenceGauge value={prospect.pertinence_etiquette} />
        <div className={s.cardMeta}>
          {statutLabel(prospect.statut)}
          {prospect.possible_doublon ? " · doublon possible" : ""}
        </div>
      </button>
      <div className={s.cardActions}>
        <button
          type="button"
          className={`${s.iconBtn} ${favori ? s.starOn : ""}`}
          aria-pressed={favori}
          aria-label={favori ? `Retirer ${prospect.entreprise} des favoris` : `Ajouter ${prospect.entreprise} aux favoris`}
          onClick={() => onToggleFavori(prospect.id)}
        >
          <span className={s.star} aria-hidden="true">{favori ? "★" : "☆"}</span>
        </button>
        {prospect.statut === "nouveau" ? (
          <button type="button" className={s.iconBtn} disabled={contacting} aria-label={`Marquer ${prospect.entreprise} contacté`} onClick={() => onContacter(prospect.id)}>
            Contacter
          </button>
        ) : null}
        <button type="button" className={s.iconBtn} aria-label={`Note sur ${prospect.entreprise}`} onClick={() => onOpen(prospect.id)}>
          Note
        </button>
      </div>
    </li>
  );
}
