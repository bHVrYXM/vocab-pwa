import { db, type Deck } from '../db/schema';
import { newCardRow } from '../srs/scheduler';
import { parseCsvDeck } from './csv';
import { parseJsonDeck } from './json';
import { ImportError, type ParsedImport, type ParsedNote } from './types';

export * from './types';
export { applyMapping, guessMapping } from './mapping';

async function loadSql() {
  const [{ default: initSqlJs }, { default: wasmUrl }] = await Promise.all([
    import('sql.js'),
    import('sql.js/dist/sql-wasm-browser.wasm?url'),
  ]);
  return initSqlJs({ locateFile: () => wasmUrl });
}

export async function parseFile(file: File): Promise<ParsedImport> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'apkg' || ext === 'colpkg' || ext === 'zip') {
    const [{ parseApkg }, SQL] = await Promise.all([import('./apkg/parse'), loadSql()]);
    return parseApkg(new Uint8Array(await file.arrayBuffer()), SQL);
  }
  return parseText(await file.text(), ext);
}

/** Parses pasted or file text; JSON is detected by content when no extension is known. */
export function parseText(text: string, ext?: string): ParsedImport {
  const trimmed = text.trim();
  if (!trimmed) throw new ImportError('Nothing to import.');
  if (ext === 'json' || (ext === undefined && /^(```|\{|\[)/.test(trimmed))) return parseJsonDeck(trimmed);
  return parseCsvDeck(text);
}

export interface ImportTarget {
  /** Existing deck to add to, or settings for a new deck. */
  deckId?: number;
  name: string;
  sourceLang: string;
  targetLang: string;
  reverse: boolean;
}

export async function saveImport(
  target: ImportTarget,
  notes: ParsedNote[],
  media: Map<string, Blob>,
): Promise<{ deckId: number; added: number; duplicates: number }> {
  return db.transaction('rw', [db.decks, db.notes, db.cards, db.media], async () => {
    let deckId = target.deckId;
    let reverse = target.reverse;
    if (deckId === undefined) {
      const deck: Deck = {
        name: target.name.trim() || 'Untitled deck',
        sourceLang: target.sourceLang,
        targetLang: target.targetLang,
        createdAt: Date.now(),
        newPerDay: 15,
        reverse: target.reverse,
        autoplay: true,
        typed: false,
      };
      deckId = await db.decks.add(deck);
    } else {
      reverse = (await db.decks.get(deckId))?.reverse ?? reverse;
    }

    // Skip words that are already in the deck with the same translation.
    const existing = new Set(
      (await db.notes.where('deckId').equals(deckId).toArray()).map((n) => key(n.front, n.back)),
    );
    let added = 0;
    let duplicates = 0;
    const usedMedia = new Set<string>();
    for (const n of notes) {
      const k = key(n.front, n.back);
      if (existing.has(k)) {
        duplicates++;
        continue;
      }
      existing.add(k);
      const hasAudio = n.audio !== undefined && media.has(n.audio);
      if (hasAudio) usedMedia.add(n.audio!);
      // Media names are scoped per deck so two decks can both contain "1.mp3".
      const audio = hasAudio ? `${deckId}/${n.audio}` : undefined;
      const noteId = await db.notes.add({ ...n, audio, deckId });
      await db.cards.add(newCardRow(noteId, deckId, 'forward'));
      if (reverse) await db.cards.add(newCardRow(noteId, deckId, 'reverse'));
      added++;
    }
    for (const name of usedMedia) {
      await db.media.put({ name: `${deckId}/${name}`, deckId, blob: media.get(name)! });
    }
    return { deckId, added, duplicates };
  });
}

const key = (front: string, back: string) => `${front.trim().toLowerCase()}\u0000${back.trim().toLowerCase()}`;
