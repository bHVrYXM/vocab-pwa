import Dexie from 'dexie';
import { createEmptyCard, fsrs, Rating, type Card, type Grade } from 'ts-fsrs';
import { db, localDay, type CardRow, type Deck, type Direction, type StoredFsrs } from '../db/schema';

const scheduler = fsrs({ enable_fuzz: true });

/** Learning cards due within this window are shown instead of ending the session. */
const LEARN_AHEAD_MS = 20 * 60 * 1000;

export { Rating };
export type { Grade };

export function newFsrs(now = new Date()): StoredFsrs {
  return toStored(createEmptyCard(now));
}

function toStored(card: Card): StoredFsrs {
  return {
    due: card.due.getTime(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review?.getTime(),
  };
}

function fromStored(s: StoredFsrs): Card {
  return {
    ...s,
    due: new Date(s.due),
    last_review: s.last_review === undefined ? undefined : new Date(s.last_review),
  };
}

export function newCardRow(noteId: number, deckId: number, direction: Direction): CardRow {
  const fs = newFsrs();
  return { noteId, deckId, direction, isNew: 1, due: fs.due, fsrs: fs };
}

/** Time until the card would be due again for each rating, e.g. { 1: "1m", 3: "2d" }. */
export function previewIntervals(row: CardRow, now = new Date()): Record<Grade, string> {
  const preview = scheduler.repeat(fromStored(row.fsrs), now);
  const out = {} as Record<Grade, string>;
  for (const g of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as Grade[]) {
    out[g] = formatInterval(preview[g].card.due.getTime() - now.getTime());
  }
  return out;
}

export function formatInterval(ms: number): string {
  const min = Math.max(1, Math.round(ms / 60000));
  if (min < 60) return `${min}m`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 31) return `${d}d`;
  const mo = d / 30.4;
  if (mo < 12) return `${Math.round(mo)}mo`;
  return `${(d / 365).toFixed(1).replace(/\.0$/, '')}y`;
}

export async function answer(row: CardRow, grade: Grade, now = new Date()): Promise<void> {
  const { card } = scheduler.next(fromStored(row.fsrs), now, grade);
  const fs = toStored(card);
  await db.transaction('rw', [db.cards, db.reviews], async () => {
    await db.cards.update(row.id!, { fsrs: fs, due: fs.due, isNew: 0 });
    await db.reviews.add({
      cardId: row.id!,
      deckId: row.deckId,
      day: localDay(now),
      rating: grade,
      wasNew: row.isNew === 1,
      reviewedAt: now.getTime(),
    });
  });
}

export async function newCardsLeftToday(deck: Deck, now = new Date()): Promise<number> {
  const introduced = await db.reviews
    .where('[deckId+day]')
    .equals([deck.id!, localDay(now)])
    .filter((r) => r.wasNew)
    .count();
  return Math.max(0, deck.newPerDay - introduced);
}

export interface DeckCounts {
  due: number;
  newAvailable: number;
}

export async function deckCounts(deck: Deck, now = Date.now()): Promise<DeckCounts> {
  const due = await db.cards
    .where('[deckId+isNew+due]')
    .between([deck.id!, 0, Dexie.minKey], [deck.id!, 0, now], true, true)
    .count();
  const totalNew = await db.cards.where('[deckId+isNew]').equals([deck.id!, 1]).count();
  const left = await newCardsLeftToday(deck, new Date(now));
  return { due, newAvailable: Math.min(totalNew, left) };
}

/**
 * Picks the next card to study: overdue reviews first, then new cards within the
 * daily limit, then learning cards that come due within the next few minutes.
 */
export async function nextCard(deck: Deck, now = Date.now()): Promise<CardRow | undefined> {
  const due = await db.cards
    .where('[deckId+isNew+due]')
    .between([deck.id!, 0, Dexie.minKey], [deck.id!, 0, now], true, true)
    .first();
  if (due) return due;

  if ((await newCardsLeftToday(deck, new Date(now))) > 0) {
    // New cards are introduced in insertion order, forward before reverse.
    const fresh = await db.cards.where('[deckId+isNew]').equals([deck.id!, 1]).sortBy('id');
    const pick = fresh.find((c) => c.direction === 'forward') ?? fresh[0];
    if (pick) return pick;
  }

  return db.cards
    .where('[deckId+isNew+due]')
    .between([deck.id!, 0, now], [deck.id!, 0, now + LEARN_AHEAD_MS], true, true)
    .first();
}

/** Consecutive days (ending today or yesterday) with at least one review. */
export async function studyStreak(): Promise<number> {
  const days = new Set((await db.reviews.orderBy('day').uniqueKeys()) as string[]);
  const cursor = new Date();
  if (!days.has(localDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(localDay(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
