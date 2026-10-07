import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db, getSetting, setSetting } from '../src/db/schema';
import { buildDailyWordNotification } from '../src/daily-word/notification';
import { saveImport } from '../src/import';
import { answer, deckCounts, nextCard, Rating } from '../src/srs/scheduler';

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()));
});

async function makeDeck(n: number, reverse = false) {
  const notes = Array.from({ length: n }, (_, i) => ({ front: `w${i}`, back: `t${i}`, tags: [] }));
  return saveImport({ name: 'Test', sourceLang: 'es', targetLang: 'en', reverse }, notes, new Map());
}

describe('saveImport', () => {
  it('creates notes and cards, skipping duplicates on re-import', async () => {
    const { deckId, added } = await makeDeck(3, true);
    expect(added).toBe(3);
    expect(await db.cards.count()).toBe(6);
    const again = await saveImport(
      { deckId, name: '', sourceLang: '', targetLang: '', reverse: false },
      [{ front: 'W0', back: 't0', tags: [] }, { front: 'new', back: 'x', tags: [] }],
      new Map(),
    );
    expect(again).toMatchObject({ added: 1, duplicates: 1 });
    expect(await db.cards.count()).toBe(8); // deck has reverse on, so 2 cards for the new note
  });
});

describe('scheduler', () => {
  it('respects the daily new-card limit and moves answered cards out of "new"', async () => {
    const { deckId } = await makeDeck(20);
    const deck = (await db.decks.get(deckId))!;
    await db.decks.update(deckId, { newPerDay: 2 });
    deck.newPerDay = 2;
    expect(await deckCounts(deck)).toEqual({ due: 0, newAvailable: 2 });

    for (let i = 0; i < 2; i++) {
      const card = (await nextCard(deck))!;
      expect(card.isNew).toBe(1);
      await answer(card, Rating.Easy);
    }
    expect((await deckCounts(deck)).newAvailable).toBe(0);
    // Easy on a new card schedules it days out, so nothing is left for today.
    expect(await nextCard(deck)).toBeUndefined();
    expect(await db.reviews.count()).toBe(2);
  });

  it('shows a learning card again soon after "Again"', async () => {
    const { deckId } = await makeDeck(1);
    const deck = (await db.decks.get(deckId))!;
    const card = (await nextCard(deck))!;
    await answer(card, Rating.Again);
    const again = await nextCard(deck);
    expect(again?.id).toBe(card.id);
    expect(again?.isNew).toBe(0);
  });
});

describe('daily word', () => {
  it('asks to pick a deck when none is selected', async () => {
    const n = await buildDailyWordNotification();
    expect(n.options.data.path).toBe('#/settings');
  });

  it('shows every word once before repeating', async () => {
    const { deckId } = await makeDeck(5);
    await setSetting('dailyWordDeckId', deckId);
    const seen: string[] = [];
    for (let i = 0; i < 5; i++) seen.push((await buildDailyWordNotification()).title);
    expect(seen.sort()).toEqual(['w0', 'w1', 'w2', 'w3', 'w4']);
    const sixth = await buildDailyWordNotification();
    expect(sixth.options.body).toMatch(/^t\d$/);
    expect(sixth.options.data.path).toMatch(/^#\/word\/\d+$/);
    expect(await getSetting('lastDailyWord', null)).not.toBeNull();
  });

  it('skips deleted words', async () => {
    const { deckId } = await makeDeck(3);
    await setSetting('dailyWordDeckId', deckId);
    await buildDailyWordNotification(); // builds the shuffled list
    const row = (await db.dailyWord.get(deckId))!;
    await db.notes.bulkDelete(row.remaining);
    // The remaining ids are gone, so it reshuffles from what's left.
    const n = await buildDailyWordNotification();
    expect(n.title).toMatch(/^w\d$/);
  });
});
