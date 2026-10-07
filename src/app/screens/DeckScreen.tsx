import { useState } from 'preact/hooks';
import { db, deleteDeck, getSetting, setSetting, type Deck } from '../../db/schema';
import { go } from '../../lib/router';
import { useLive } from '../../lib/useLive';
import { deckCounts, newCardRow } from '../../srs/scheduler';
import { Empty, Header, LangSelect, Toggle } from '../components/ui';

const PAGE = 100;

export function DeckScreen({ deckId }: { deckId: number }) {
  const deck = useLive(() => db.decks.get(deckId), [deckId]);
  const counts = useLive(async () => (deck ? deckCounts(deck) : undefined), [deck]);
  const total = useLive(() => db.notes.where('deckId').equals(deckId).count(), [deckId]);
  const isDaily = useLive(async () => (await getSetting<number | null>('dailyWordDeckId', null)) === deckId, [deckId]);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const [showSettings, setShowSettings] = useState(false);
  const notes = useLive(async () => {
    const q = query.trim().toLowerCase();
    let coll = db.notes.where('deckId').equals(deckId);
    if (q) coll = coll.filter((n) => n.front.toLowerCase().includes(q) || n.back.toLowerCase().includes(q));
    return coll.limit(limit).toArray();
  }, [deckId, query, limit]);

  if (deck === undefined) return <main><Header title="" back="#/" /></main>;

  const update = (changes: Partial<Deck>) => db.decks.update(deckId, changes);

  async function setReverse(on: boolean) {
    if (on) {
      await db.transaction('rw', [db.decks, db.notes, db.cards], async () => {
        const withReverse = new Set(
          (await db.cards.where('deckId').equals(deckId).filter((c) => c.direction === 'reverse').toArray()).map((c) => c.noteId),
        );
        const noteIds = (await db.notes.where('deckId').equals(deckId).primaryKeys()) as number[];
        await db.cards.bulkAdd(noteIds.filter((id) => !withReverse.has(id)).map((id) => newCardRow(id, deckId, 'reverse')));
        await update({ reverse: true });
      });
    } else {
      if (!confirm('Remove the reverse cards? Their study progress will be lost.')) return;
      await db.transaction('rw', [db.decks, db.cards], async () => {
        await db.cards.where('deckId').equals(deckId).filter((c) => c.direction === 'reverse').delete();
        await update({ reverse: false });
      });
    }
  }

  async function remove() {
    if (!confirm(`Delete "${deck!.name}" and all its progress? This cannot be undone.`)) return;
    await deleteDeck(deckId);
    go('/');
  }

  const studyable = (counts?.due ?? 0) + (counts?.newAvailable ?? 0);

  return (
    <main>
      <Header title={deck.name} back="#/">
        <button class="icon-btn" aria-label="Deck settings" onClick={() => setShowSettings((s) => !s)}>
          ⚙︎
        </button>
      </Header>

      <div class="deck-summary">
        <div>
          <strong class="due">{counts?.due ?? '–'}</strong>
          <small>due</small>
        </div>
        <div>
          <strong class="new">{counts?.newAvailable ?? '–'}</strong>
          <small>new today</small>
        </div>
        <div>
          <strong>{total ?? '–'}</strong>
          <small>words</small>
        </div>
      </div>

      <a class={`btn primary wide ${studyable ? '' : 'disabled'}`} href={`#/study/${deckId}`}>
        {studyable ? 'Study' : 'All caught up for today'}
      </a>

      {showSettings && (
        <section class="panel">
          <label class="field">
            <span>Name</span>
            <input value={deck.name} onChange={(e) => update({ name: e.currentTarget.value.trim() || deck.name })} />
          </label>
          <LangSelect label="Front language (learning)" value={deck.sourceLang} onChange={(v) => update({ sourceLang: v })} />
          <LangSelect label="Back language (translation)" value={deck.targetLang} onChange={(v) => update({ targetLang: v })} />
          <label class="field">
            <span>New words per day</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={500}
              value={deck.newPerDay}
              onChange={(e) => update({ newPerDay: Math.max(0, Math.min(500, Number(e.currentTarget.value) || 0)) })}
            />
          </label>
          <Toggle label="Reverse cards" hint="Also ask translation → word" checked={deck.reverse} onChange={setReverse} />
          <Toggle label="Auto-play pronunciation" checked={deck.autoplay} onChange={(v) => update({ autoplay: v })} />
          <Toggle label="Type the answer" hint="Check spelling before revealing" checked={deck.typed} onChange={(v) => update({ typed: v })} />
          <Toggle
            label="Use for daily word"
            checked={!!isDaily}
            onChange={(v) => setSetting('dailyWordDeckId', v ? deckId : null)}
          />
          <div class="row-buttons">
            <a class="btn" href={`#/import/${deckId}`}>
              Import more words
            </a>
            <button class="btn danger" onClick={remove}>
              Delete deck
            </button>
          </div>
        </section>
      )}

      <section>
        <div class="section-title">
          <h2>Words</h2>
          <a class="btn small" href={`#/deck/${deckId}/note/new`}>
            + Add
          </a>
        </div>
        <input class="search" type="search" placeholder="Search" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        {notes?.length === 0 && <Empty>{query ? 'No matches.' : 'No words yet.'}</Empty>}
        <ul class="list words">
          {notes?.map((n) => (
            <li key={n.id}>
              <a href={`#/deck/${deckId}/note/${n.id}`}>
                <span>{n.front}</span>
                <small>{n.back}</small>
              </a>
            </li>
          ))}
        </ul>
        {notes && notes.length === limit && (
          <button class="btn wide" onClick={() => setLimit((l) => l + PAGE)}>
            Show more
          </button>
        )}
      </section>
    </main>
  );
}
