/**
 * Diff lisible mot à mot entre deux textes (instructions d'agent avant/après amélioration). Pur, aucune dépendance.
 * Plus proche d'un diff de relecture que d'un diff de code : par mots, pas par ligne.
 */
export type DiffOp = "same" | "add" | "remove";
export interface DiffToken {
  op: DiffOp;
  text: string;
}

function words(s: string): string[] {
  return s.split(/(\s+)/).filter((w) => w.length > 0);
}

/** Plus longue sous-séquence commune de deux listes de mots, puis reconstruction du diff. */
export function diffWords(before: string, after: string): DiffToken[] {
  const a = words(before);
  const b = words(after);
  const n = a.length;
  const m = b.length;
  const lcs: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffToken[] = [];
  let i = 0;
  let j = 0;
  const push = (op: DiffOp, text: string) => {
    const last = out[out.length - 1];
    if (last && last.op === op) last.text += text;
    else out.push({ op, text });
  };
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("same", a[i]!);
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      push("remove", a[i]!);
      i++;
    } else {
      push("add", b[j]!);
      j++;
    }
  }
  while (i < n) push("remove", a[i++]!);
  while (j < m) push("add", b[j++]!);
  return out;
}
