import { db, getSetting, localDay } from '../../db/schema';
import type { LastDailyWord } from '../../daily-word/pick';
import { languageName } from '../../lib/langs';
import { isIOS, isStandalone } from '../../lib/platform';
import { pronounce } from '../../lib/speech';
import { useLive } from '../../lib/useLive';
import { deckCounts, studyStreak } from '../../srs/scheduler';
import { Empty, Header } from '../components/ui';

export function HomeScreen() {
  const decks = useLive(async () => {
    const all = await db.decks.orderBy('name').toArray();
    return Promise.all(all.map(async (deck) => ({ deck, counts: await deckCounts(deck) })));
  }, []);
  const stats = useLive(async () => ({
    streak: await studyStreak(),
    today: await db.reviews.where('day').equals(localDay()).count(),
  }), []);
  const daily = useLive(async () => {
    const last = await getSetting<LastDailyWord | null>('lastDailyWord', null);
    if (!last || localDay(new Date(last.shownAt)) !== localDay()) return null;
    const note = await db.notes.get(last.noteId);
    const deck = note && (await db.decks.get(note.deckId));
    return note && deck ? { note, deck } : null;
  }, []);

  return (
    <main>
      <Header title="Vocab">
        <a class="icon-btn" href="#/settings" aria-label="Settings">
          ⚙︎
        </a>
      </Header>

      {isIOS && !isStandalone() && (
        <div class="notice">
          Tap <strong>Share</strong> → <strong>Add to Home Screen</strong> to install Vocab. Your data stays safe and the daily word can
          reach you.
        </div>
      )}

      {daily && (
        <a class="card daily" href={`#/word/${daily.note.id}`}>
          <small>Today’s word</small>
          <div class="daily-front">{daily.note.front}</div>
          <div class="daily-back">{daily.note.back}</div>
          <button
            class="speak"
            aria-label="Pronounce"
            onClick={(e) => {
              e.preventDefault();
              pronounce(daily.note.front, daily.deck.sourceLang, daily.note.audio);
            }}
          >
            🔊
          </button>
        </a>
      )}

      {stats && (stats.today > 0 || stats.streak > 0) && (
        <div class="stats">
          <div>
            <strong>{stats.today}</strong>
            <small>reviews today</small>
          </div>
          <div>
            <strong>{stats.streak}</strong>
            <small>day streak</small>
          </div>
        </div>
      )}

      <section>
        <div class="section-title">
          <h2>Decks</h2>
          <a class="btn small" href="#/import">
            + Import
          </a>
        </div>
        {decks?.length === 0 && (
          <Empty>
            <p>No decks yet.</p>
            <p>
              Import a <strong>.apkg</strong> file, a CSV, or a deck generated with AI.
            </p>
            <a class="btn primary" href="#/import">
              Import your first deck
            </a>
          </Empty>
        )}
        <ul class="list">
          {decks?.map(({ deck, counts }) => (
            <li key={deck.id}>
              <a class="deck-row" href={`#/deck/${deck.id}`}>
                <span class="deck-name">
                  {deck.name}
                  <small>
                    {languageName(deck.sourceLang)} → {languageName(deck.targetLang)}
                  </small>
                </span>
                <span class="counts">
                  <span class="count due" title="Due">
                    {counts.due}
                  </span>
                  <span class="count new" title="New">
                    {counts.newAvailable}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
