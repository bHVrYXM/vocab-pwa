export interface DiffPart {
  kind: 'same' | 'extra' | 'missing';
  text: string;
}

const normalize = (s: string) => s.trim().replace(/\s+/g, ' ').replace(/[.!?¡¿]+$/g, '').toLowerCase();

/**
 * Compares a typed answer with the solution (case-insensitive, accents matter).
 * Any one of several comma-separated alternatives counts as correct.
 */
export function diffAnswer(typed: string, solution: string): { correct: boolean; parts: DiffPart[] } {
  const t = normalize(typed);
  const alternatives = solution.split(/[,;/\n]/).map(normalize).filter(Boolean);
  if (alternatives.includes(t) || normalize(solution) === t) return { correct: true, parts: [{ kind: 'same', text: typed.trim() }] };

  // Show the diff against the closest alternative.
  const target = alternatives.reduce((best, alt) => (lcs(t, alt).length > lcs(t, best).length ? alt : best), alternatives[0] ?? '');
  return { correct: false, parts: charDiff(t, target) };
}

function lcsTable(a: string, b: string): number[][] {
  const dp = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  return dp;
}

function lcs(a: string, b: string): string {
  const dp = lcsTable(a, b);
  let out = '';
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) (out += a[i]), i++, j++;
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
    else j++;
  }
  return out;
}

function charDiff(typed: string, target: string): DiffPart[] {
  const dp = lcsTable(typed, target);
  const parts: DiffPart[] = [];
  const push = (kind: DiffPart['kind'], ch: string) => {
    const last = parts[parts.length - 1];
    if (last?.kind === kind) last.text += ch;
    else parts.push({ kind, text: ch });
  };
  let i = 0;
  let j = 0;
  while (i < typed.length || j < target.length) {
    if (i < typed.length && j < target.length && typed[i] === target[j]) push('same', typed[i++]), j++;
    else if (j < target.length && (i >= typed.length || dp[i][j + 1] >= dp[i + 1][j])) push('missing', target[j++]);
    else push('extra', typed[i++]);
  }
  return parts;
}
