import { useEffect, useRef, useState } from 'preact/hooks';
import { db, type CardRow, type Deck, type Note } from '../../db/schema';
import { pronounce } from '../../lib/speech';
import { answer, nextCard, previewIntervals, Rating, type Grade } from '../../srs/scheduler';
import { Header } from '../components/ui';
import { diffAnswer } from './typedDiff';

interface Current {
  card: CardRow;
  note: Note;
  intervals: Record<Grade, string>;
}

const GRADES: { grade: Grade; label: string; cls: string }[] = [
  { grade: Rating.Again, label: 'Again', cls: 'again' },
  { grade: Rating.Hard, label: 'Hard', cls: 'hard' },
  { grade: Rating.Good, label: 'Good', cls: 'good' },
  { grade: Rating.Easy, label: 'Easy', cls: 'easy' },
];

export function StudyScreen({ deckId }: { deckId: number }) {
  const [deck, setDeck] = useState<Deck>();
  const [current, setCurrent] = useState<Current | null | undefined>(undefined);
  const [revealed, setRevealed] = useState(false);
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(0);
  const busy = useRef(false);

  async function load(d: Deck) {
    const card = await nextCard(d);
    const note = card && (await db.notes.get(card.noteId));
    if (!card || !note) {
      setCurrent(null);
      return;
    }
    setCurrent({ card, note, intervals: previewIntervals(card) });
    setRevealed(false);
    setTyped('');
    if (d.autoplay && card.direction === 'forward') pronounce(note.front, d.sourceLang, note.audio);
  }

  useEffect(() => {
    db.decks.get(deckId).then((d) => {
      if (!d) return;
      setDeck(d);
      load(d);
    });
  }, [deckId]);

  function reveal() {
    setRevealed(true);
    if (deck?.autoplay && current?.card.direction === 'reverse') pronounce(current.note.front, deck.sourceLang, current.note.audio);
  }

  async function rate(grade: Grade) {
    if (!current || !deck || busy.current) return;
    busy.current = true;
    try {
      await answer(current.card, grade);
      setDone((n) => n + 1);
      await load(deck);
    } finally {
      busy.current = false;
    }
  }

  // Keyboard shortcuts for desktop: space reveals, 1–4 rate.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        if (e.key === 'Enter' && !revealed) reveal();
        return;
      }
      if (!revealed && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        reveal();
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) rate(Number(e.key) as Grade);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!deck || current === undefined) return <main><Header title="" back={`#/deck/${deckId}`} /></main>;

  if (current === null) {
    return (
      <main>
        <Header title={deck.name} back={`#/deck/${deckId}`} />
        <div class="empty">
          <p class="big">🎉</p>
          <p>{done > 0 ? `Done for now — ${done} card${done === 1 ? '' : 's'} reviewed.` : 'Nothing due right now.'}</p>
          <a class="btn primary" href="#/">
            Back to decks
          </a>
        </div>
      </main>
    );
  }

  const { card, note } = current;
  const forward = card.direction === 'forward';
  const prompt = forward ? note.front : note.back;
  const solution = forward ? note.back : note.front;
  const showTyped = deck.typed;

  return (
    <main class="study">
      <Header title={deck.name} back={`#/deck/${deckId}`}>
        <span class="muted">{done}</span>
      </Header>

      <div class="study-card" onClick={() => !revealed && !showTyped && reveal()}>
        <div class="prompt">
          {prompt}
          {forward && (
            <button class="speak" aria-label="Pronounce" onClick={(e) => (e.stopPropagation(), pronounce(note.front, deck.sourceLang, note.audio))}>
              🔊
            </button>
          )}
        </div>

        {showTyped && !revealed && (
          <form
            class="typed"
            onSubmit={(e) => {
              e.preventDefault();
              reveal();
            }}
          >
            <input
              autoFocus
              autocapitalize="off"
              autocomplete="off"
              spellcheck={false}
              lang={forward ? deck.targetLang : deck.sourceLang}
              placeholder="Type the answer"
              value={typed}
              onInput={(e) => setTyped(e.currentTarget.value)}
            />
          </form>
        )}

        {revealed && (
          <div class="answer">
            <hr />
            {showTyped && typed && <TypedResult typed={typed} solution={solution} />}
            <div class="solution">
              {solution}
              {!forward && (
                <button class="speak" aria-label="Pronounce" onClick={(e) => (e.stopPropagation(), pronounce(note.front, deck.sourceLang, note.audio))}>
                  🔊
                </button>
              )}
            </div>
            {note.example && (
              <div class="example">
                <span onClick={(e) => (e.stopPropagation(), pronounce(note.example!, deck.sourceLang))}>{note.example}</span>
                {note.exampleTranslation && <small>{note.exampleTranslation}</small>}
              </div>
            )}
          </div>
        )}

        {!revealed && !showTyped && <div class="hint">Tap to show answer</div>}
      </div>

      <div class="actions">
        {revealed ? (
          <div class="grades">
            {GRADES.map((g) => (
              <button key={g.grade} class={`grade ${g.cls}`} onClick={() => rate(g.grade)}>
                {g.label}
                <small>{current.intervals[g.grade]}</small>
              </button>
            ))}
          </div>
        ) : (
          <button class="btn primary wide" onClick={reveal}>
            Show answer
          </button>
        )}
      </div>
    </main>
  );
}

function TypedResult({ typed, solution }: { typed: string; solution: string }) {
  const diff = diffAnswer(typed, solution);
  return (
    <div class={`typed-result ${diff.correct ? 'ok' : 'wrong'}`}>
      {diff.correct ? '✓ ' : ''}
      {diff.parts.map((p, i) => (
        <span key={i} class={p.kind}>
          {p.text}
        </span>
      ))}
    </div>
  );
}
