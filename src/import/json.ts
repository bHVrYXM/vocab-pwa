import { ImportError, type ParsedMapped, type ParsedNote } from './types';

export const JSON_FORMAT_ID = 'vocab-deck/1';

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export function parseJsonDeck(text: string): ParsedMapped {
  let data: unknown;
  try {
    data = JSON.parse(stripCodeFence(text));
  } catch (e) {
    throw new ImportError(`This is not valid JSON: ${(e as Error).message}`);
  }

  // Accept a bare array of cards as well as the full object.
  const obj = (Array.isArray(data) ? { cards: data } : data) as Record<string, unknown>;
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.cards)) {
    throw new ImportError('Expected an object with a "cards" array.');
  }

  const warnings: string[] = [];
  if (obj.format !== undefined && obj.format !== JSON_FORMAT_ID) {
    warnings.push(`Unknown format "${String(obj.format)}", importing anyway.`);
  }

  const notes: ParsedNote[] = [];
  obj.cards.forEach((raw, i) => {
    const c = (raw ?? {}) as Record<string, unknown>;
    const front = str(c.front);
    const back = str(c.back);
    if (!front || !back) {
      warnings.push(`Card ${i + 1}: missing ${!front ? 'front' : 'back'}, skipped.`);
      return;
    }
    notes.push({
      front,
      back,
      example: str(c.example),
      exampleTranslation: str(c.exampleTranslation),
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
    });
  });

  return {
    kind: 'mapped',
    name: str(obj.name),
    sourceLang: str(obj.sourceLang),
    targetLang: str(obj.targetLang),
    notes,
    media: new Map(),
    warnings,
  };
}

/** AI chats often wrap JSON in ```json fences; accept that when pasted. */
function stripCodeFence(text: string): string {
  const m = text.trim().match(/^```[\w-]*\s*\n([\s\S]*?)\n?```$/);
  return m ? m[1] : text;
}
