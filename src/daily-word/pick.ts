import { db, getSetting, setSetting, type Deck, type Note } from '../db/schema';

// Shared by the app and the service worker, so this module must not touch the DOM.

export interface DailyWord {
  note: Note;
  deck: Deck;
}

export interface LastDailyWord {
  noteId: number;
  shownAt: number;
}

function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/**
 * Takes the next word from the selected deck. Words come from a shuffled list,
 * so none repeats until every word in the deck has been shown once.
 */
export async function pickDailyWord(): Promise<DailyWord | null> {
  const deckId = await getSetting<number | null>('dailyWordDeckId', null);
  if (deckId === null) return null;

  return db.transaction('rw', [db.decks, db.notes, db.dailyWord, db.settings], async () => {
    const deck = await db.decks.get(deckId);
    if (!deck) return null;

    const row = (await db.dailyWord.get(deckId)) ?? { deckId, remaining: [] };
    for (let attempt = 0; attempt < 2; attempt++) {
      if (row.remaining.length === 0) {
        const ids = (await db.notes.where('deckId').equals(deckId).primaryKeys()) as number[];
        if (ids.length === 0) return null;
        row.remaining = shuffle(ids);
      }
      while (row.remaining.length) {
        const noteId = row.remaining.pop()!;
        const note = await db.notes.get(noteId);
        if (note) {
          await db.dailyWord.put(row);
          await setSetting('lastDailyWord', { noteId, shownAt: Date.now() } satisfies LastDailyWord);
          return { note, deck };
        }
      }
      // Every remaining id was deleted; reshuffle once from the current notes.
    }
    return null;
  });
}
