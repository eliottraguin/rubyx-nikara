import type { ReactNode } from "react";

/**
 * Rendu Markdown minimal et SÛR pour du contenu généré par l'IA (donnée non fiable).
 * Ne produit que des éléments React (échappés par défaut) : jamais de HTML brut,
 * jamais de lien cliquable, jamais de script. Gère titres, listes, gras, italique.
 */
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(re)) {
    const idx = m.index ?? 0;
    if (idx > last) out.push(text.slice(last, idx));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(<strong key={`${keyBase}-${i}`}>{tok.slice(2, -2)}</strong>);
    else out.push(<em key={`${keyBase}-${i}`}>{tok.slice(1, -1)}</em>);
    last = idx + tok.length;
    i++;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function SafeMarkdown({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: ReactNode[] = [];
  let list: string[] = [];
  let para: string[] = [];
  let k = 0;
  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={k++}>{inline(para.join(" "), `p${k}`)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list.length) {
      const items = list;
      const key = k++;
      blocks.push(
        <ul key={key}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `l${key}-${j}`)}</li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (bullet) {
      flushPara();
      list.push(bullet[1] ?? "");
    } else if (heading) {
      flushPara();
      flushList();
      blocks.push(
        <p key={k++}>
          <strong>{heading[1]}</strong>
        </p>,
      );
    } else if (line.trim() === "") {
      flushPara();
      flushList();
    } else {
      flushList();
      para.push(line.trim());
    }
  }
  flushPara();
  flushList();
  return <div className="md">{blocks}</div>;
}
