import { db } from '../../db/schema';
import { languageName } from '../../lib/langs';
import { pronounce } from '../../lib/speech';
import { useLive } from '../../lib/useLive';
import { Empty, Header } from '../components/ui';

export function WordScreen({ noteId }: { noteId: number }) {
  const data = useLive(async () => {
    const note = await db.notes.get(noteId);
    const deck = note && (await db.decks.get(note.deckId));
    return note && deck ? { note, deck } : null;
  }, [noteId]);

  if (data === undefined) return <main><Header title="" back="#/" /></main>;
  if (data === null) {
    return (
      <main>
        <Header title="Word" back="#/" />
        <Empty>This word was deleted.</Empty>
      </main>
    );
  }

  const { note, deck } = data;
  return (
    <main>
      <Header title={deck.name} back="#/" />
      <article class="word">
        <small>{languageName(deck.sourceLang)}</small>
        <h2>
          {note.front}
          <button class="speak" aria-label="Pronounce" onClick={() => pronounce(note.front, deck.sourceLang, note.audio)}>
            🔊
          </button>
        </h2>
        <p class="word-back">{note.back}</p>
        {note.example && (
          <div class="example">
            <span onClick={() => pronounce(note.example!, deck.sourceLang)}>{note.example}</span>
            {note.exampleTranslation && <small>{note.exampleTranslation}</small>}
          </div>
        )}
        {note.tags.length > 0 && (
          <div class="tags">
            {note.tags.map((t) => (
              <span key={t} class="tag">
                {t}
              </span>
            ))}
          </div>
        )}
      </article>
      <div class="row-buttons">
        <a class="btn" href={`#/deck/${deck.id}`}>
          Open deck
        </a>
        <a class="btn primary" href={`#/study/${deck.id}`}>
          Study
        </a>
      </div>
    </main>
  );
}
