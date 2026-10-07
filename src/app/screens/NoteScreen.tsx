import { useEffect, useState } from 'preact/hooks';
import { db, deleteNote, type Note } from '../../db/schema';
import { go } from '../../lib/router';
import { newCardRow } from '../../srs/scheduler';
import { Header } from '../components/ui';

type Draft = Pick<Note, 'front' | 'back' | 'example' | 'exampleTranslation'> & { tags: string };

const EMPTY: Draft = { front: '', back: '', example: '', exampleTranslation: '', tags: '' };

export function NoteScreen({ deckId, noteId }: { deckId: number; noteId?: number }) {
  const [draft, setDraft] = useState<Draft | null>(noteId === undefined ? EMPTY : null);
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (noteId === undefined) return;
    db.notes.get(noteId).then((n) => n && setDraft({ ...n, tags: n.tags.join(', ') }));
  }, [noteId]);

  if (!draft) return <main><Header title="" back={`#/deck/${deckId}`} /></main>;

  const set = (k: keyof Draft) => (e: Event) => setDraft({ ...draft, [k]: (e.currentTarget as HTMLInputElement).value });

  async function save(e: Event) {
    e.preventDefault();
    if (!draft!.front.trim() || !draft!.back.trim()) return;
    const fields = {
      front: draft!.front.trim(),
      back: draft!.back.trim(),
      example: draft!.example?.trim() || undefined,
      exampleTranslation: draft!.exampleTranslation?.trim() || undefined,
      tags: draft!.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };
    if (noteId !== undefined) {
      await db.notes.update(noteId, fields);
      go(`/deck/${deckId}`);
      return;
    }
    await db.transaction('rw', [db.decks, db.notes, db.cards], async () => {
      const deck = await db.decks.get(deckId);
      const id = await db.notes.add({ ...fields, deckId });
      await db.cards.add(newCardRow(id, deckId, 'forward'));
      if (deck?.reverse) await db.cards.add(newCardRow(id, deckId, 'reverse'));
    });
    // Stay on the form so several words can be added in a row.
    setSavedCount((c) => c + 1);
    setDraft(EMPTY);
    document.querySelector<HTMLInputElement>('input[name=front]')?.focus();
  }

  async function remove() {
    if (noteId === undefined || !confirm('Delete this word and its progress?')) return;
    await deleteNote(noteId);
    go(`/deck/${deckId}`);
  }

  return (
    <main>
      <Header title={noteId === undefined ? 'Add word' : 'Edit word'} back={`#/deck/${deckId}`} />
      <form class="panel" onSubmit={save}>
        <label class="field">
          <span>Word (front)</span>
          <input name="front" required autoFocus={noteId === undefined} autocapitalize="off" value={draft.front} onInput={set('front')} />
        </label>
        <label class="field">
          <span>Translation (back)</span>
          <input required autocapitalize="off" value={draft.back} onInput={set('back')} />
        </label>
        <label class="field">
          <span>Example sentence</span>
          <textarea rows={2} value={draft.example} onInput={set('example')} />
        </label>
        <label class="field">
          <span>Example translation</span>
          <textarea rows={2} value={draft.exampleTranslation} onInput={set('exampleTranslation')} />
        </label>
        <label class="field">
          <span>Tags (comma-separated)</span>
          <input autocapitalize="off" value={draft.tags} onInput={set('tags')} />
        </label>
        <button class="btn primary wide" type="submit">
          {noteId === undefined ? 'Add' : 'Save'}
        </button>
        {savedCount > 0 && <p class="muted center">{savedCount} added</p>}
        {noteId !== undefined && (
          <button class="btn danger wide" type="button" onClick={remove}>
            Delete word
          </button>
        )}
      </form>
    </main>
  );
}
