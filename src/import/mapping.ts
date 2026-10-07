import type { FieldMapping, NoteType, ParsedNote, RawNote } from './types';

const PATTERNS: Record<keyof Omit<FieldMapping, 'audio'>, RegExp[]> = {
  front: [/^front$/i, /^(word|vocab|term|expression|target|question)/i],
  back: [/^back$/i, /(translation|meaning|definition|english|answer)/i],
  example: [/^(example|sentence)(?!.*(translation|meaning|english))/i],
  exampleTranslation: [/(example|sentence).*(translation|meaning|english)/i],
};

/** Guesses which fields hold the word, translation and example from their names. */
export function guessMapping(type: NoteType): FieldMapping {
  const used = new Set<number>();
  const find = (patterns: RegExp[]) => {
    for (const re of patterns) {
      const i = type.fieldNames.findIndex((n, idx) => !used.has(idx) && re.test(n.trim()));
      if (i >= 0) {
        used.add(i);
        return i;
      }
    }
    return -1;
  };
  // Match the more specific example-translation pattern first so it isn't taken as "example".
  const exampleTranslation = find(PATTERNS.exampleTranslation);
  const front = find(PATTERNS.front);
  const back = find(PATTERNS.back);
  const example = find(PATTERNS.example);
  const firstFree = () => {
    const i = type.fieldNames.findIndex((_, idx) => !used.has(idx));
    if (i >= 0) used.add(i);
    return i;
  };
  return {
    front: front >= 0 ? front : firstFree(),
    back: back >= 0 ? back : firstFree(),
    example,
    exampleTranslation,
    audio: -1,
  };
}

export function applyMapping(
  rawNotes: RawNote[],
  mappings: Record<string, FieldMapping | null>,
): { notes: ParsedNote[]; skipped: number } {
  const notes: ParsedNote[] = [];
  let skipped = 0;
  for (const raw of rawNotes) {
    const m = mappings[raw.noteType];
    if (!m) continue; // note type excluded by the user
    const get = (i: number) => (i >= 0 ? raw.fields[i]?.trim() || undefined : undefined);
    const front = get(m.front);
    const back = get(m.back);
    if (!front || !back) {
      skipped++;
      continue;
    }
    notes.push({
      front,
      back,
      example: get(m.example),
      exampleTranslation: get(m.exampleTranslation),
      audio: m.audio >= 0 ? raw.audio[m.audio] : raw.audio.find(Boolean),
      tags: raw.tags,
    });
  }
  return { notes, skipped };
}
