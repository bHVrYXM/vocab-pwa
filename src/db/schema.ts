import Dexie, { type Table } from 'dexie';

// Shared by the app and the service worker, so this module must not touch the DOM.

export interface Deck {
  id?: number;
  name: string;
  /** Language of the front side (the language being learned), BCP-47 like "es". */
  sourceLang: string;
  /** Language of the back side (the translation), BCP-47 like "en". */
  targetLang: string;
  createdAt: number;
  newPerDay: number;
  reverse: boolean;
  autoplay: boolean;
  typed: boolean;
}

export interface Note {
  id?: number;
  deckId: number;
  front: string;
  back: string;
  example?: string;
  exampleTranslation?: string;
  /** Name of a row in the media table. */
  audio?: string;
  tags: string[];
}

export type Direction = 'forward' | 'reverse';

/** FSRS card state with dates stored as epoch milliseconds. */
export interface StoredFsrs {
  due: number;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: number;
}

export interface CardRow {
  id?: number;
  noteId: number;
  deckId: number;
  direction: Direction;
  /** 1 while the card has never been studied (indexable, unlike booleans). */
  isNew: 0 | 1;
  due: number;
  fsrs: StoredFsrs;
}

export interface ReviewRow {
  id?: number;
  cardId: number;
  deckId: number;
  /** Local date, YYYY-MM-DD. */
  day: string;
  rating: number;
  wasNew: boolean;
  reviewedAt: number;
}

export interface MediaRow {
  name: string;
  deckId: number;
  blob: Blob;
}

export interface SettingRow {
  key: string;
  value: unknown;
}

export interface DailyWordRow {
  deckId: number;
  /** Shuffled note ids that have not been shown yet in this round. */
  remaining: number[];
}

class VocabDB extends Dexie {
  decks!: Table<Deck, number>;
  notes!: Table<Note, number>;
  cards!: Table<CardRow, number>;
  reviews!: Table<ReviewRow, number>;
  media!: Table<MediaRow, string>;
  settings!: Table<SettingRow, string>;
  dailyWord!: Table<DailyWordRow, number>;

  constructor() {
    super('vocab');
    this.version(1).stores({
      decks: '++id, name',
      notes: '++id, deckId',
      cards: '++id, noteId, deckId, [deckId+isNew], [deckId+isNew+due]',
      reviews: '++id, cardId, deckId, day, [deckId+day]',
      media: 'name, deckId',
      settings: 'key',
      dailyWord: 'deckId',
    });
  }
}

export const db = new VocabDB();

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return row === undefined ? fallback : (row.value as T);
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await db.settings.put({ key, value });
}

export function localDay(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export async function deleteDeck(deckId: number): Promise<void> {
  await db.transaction('rw', [db.decks, db.notes, db.cards, db.reviews, db.media, db.dailyWord, db.settings], async () => {
    await db.notes.where('deckId').equals(deckId).delete();
    await db.cards.where('deckId').equals(deckId).delete();
    await db.reviews.where('deckId').equals(deckId).delete();
    await db.media.where('deckId').equals(deckId).delete();
    await db.dailyWord.delete(deckId);
    await db.decks.delete(deckId);
    if ((await getSetting<number | null>('dailyWordDeckId', null)) === deckId) {
      await setSetting('dailyWordDeckId', null);
    }
  });
}

export async function deleteNote(noteId: number): Promise<void> {
  await db.transaction('rw', [db.notes, db.cards], async () => {
    await db.cards.where('noteId').equals(noteId).delete();
    await db.notes.delete(noteId);
  });
}

/** Number of cards due now across all decks (reviews only, new cards excluded). */
export async function totalDueCount(now = Date.now()): Promise<number> {
  const decks = await db.decks.toArray();
  let total = 0;
  for (const deck of decks) {
    total += await db.cards
      .where('[deckId+isNew+due]')
      .between([deck.id!, 0, Dexie.minKey], [deck.id!, 0, now], true, true)
      .count();
  }
  return total;
}
