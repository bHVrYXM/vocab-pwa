import { useMemo, useState } from 'preact/hooks';
import { db } from '../../db/schema';
import { aiPrompt } from '../../import/ai-prompt';
import {
  applyMapping,
  guessMapping,
  parseFile,
  parseText,
  saveImport,
  type FieldMapping,
  type ParsedImport,
  type ParsedNote,
} from '../../import';
import { guessLanguage, languageName } from '../../lib/langs';
import { useLive } from '../../lib/useLive';
import { Header, LangSelect, Toggle } from '../components/ui';

type Result = { deckId: number; added: number; duplicates: number; skipped: number };

export function ImportScreen({ deckId }: { deckId?: number }) {
  const [parsed, setParsed] = useState<ParsedImport | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const back = deckId !== undefined ? `#/deck/${deckId}` : '#/';

  async function run(fn: () => Promise<ParsedImport> | ParsedImport) {
    setError('');
    setBusy(true);
    try {
      setParsed(await fn());
    } catch (e) {
      console.error(e);
      setError((e as Error).message || 'Import failed.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <main>
        <Header title="Import" back={back} />
        <div class="empty">
          <p class="big">✅</p>
          <p>
            <strong>{result.added}</strong> word{result.added === 1 ? '' : 's'} added.
          </p>
          {result.duplicates > 0 && <p class="muted">{result.duplicates} already in the deck, skipped.</p>}
          {result.skipped > 0 && <p class="muted">{result.skipped} without a front or back, skipped.</p>}
          <a class="btn primary" href={`#/deck/${result.deckId}`}>
            Open deck
          </a>
        </div>
      </main>
    );
  }

  if (parsed) {
    return (
      <main>
        <Header title="Import" back={back} />
        <Preview
          parsed={parsed}
          deckId={deckId}
          onCancel={() => setParsed(null)}
          onDone={(r) => setResult(r)}
        />
      </main>
    );
  }

  return (
    <main>
      <Header title="Import" back={back} />

      <section class="panel">
        <h2>From a file</h2>
        <p class="muted">.apkg deck packages, JSON (see below) or CSV/TSV with front and back columns.</p>
        <label class={`btn primary wide ${busy ? 'disabled' : ''}`}>
          {busy ? 'Reading…' : 'Choose file'}
          <input
            type="file"
            hidden
            // No `accept` filter: iOS doesn't know the .apkg type and would grey those files out.
            // The format is detected from the file's contents instead.
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = '';
              if (file) run(() => parseFile(file));
            }}
          />
        </label>
      </section>

      <PasteBox busy={busy} onParse={(text) => run(() => parseText(text))} />

      {error && <div class="notice error">{error}</div>}

      <AiPromptBox />
    </main>
  );
}

function PasteBox({ busy, onParse }: { busy: boolean; onParse: (text: string) => void }) {
  const [text, setText] = useState('');
  return (
    <section class="panel">
      <h2>Paste</h2>
      <p class="muted">Paste JSON from an AI chat, or lines like “front, back”.</p>
      <textarea rows={5} value={text} placeholder='{"cards": [...]}' onInput={(e) => setText(e.currentTarget.value)} />
      <button class="btn wide" disabled={busy || !text.trim()} onClick={() => onParse(text)}>
        Continue
      </button>
    </section>
  );
}

function AiPromptBox() {
  const [learn, setLearn] = useState('es');
  const [native, setNative] = useState('en');
  const [topic, setTopic] = useState('Everyday food and drinks');
  const [level, setLevel] = useState('A1 (beginner)');
  const [count, setCount] = useState(40);
  const [copied, setCopied] = useState(false);
  const prompt = aiPrompt({ learn: languageName(learn), native: languageName(native), topic, count, level });

  return (
    <details class="panel">
      <summary>
        <h2>Create a deck with AI</h2>
      </summary>
      <p class="muted">Fill in the details, copy the prompt into any AI chat, then paste its answer above.</p>
      <LangSelect label="Language to learn" value={learn} onChange={setLearn} />
      <LangSelect label="Your language" value={native} onChange={setNative} />
      <label class="field">
        <span>Topic</span>
        <input value={topic} onInput={(e) => setTopic(e.currentTarget.value)} />
      </label>
      <label class="field">
        <span>Level</span>
        <select value={level} onChange={(e) => setLevel(e.currentTarget.value)}>
          {['A1 (beginner)', 'A2 (elementary)', 'B1 (intermediate)', 'B2 (upper intermediate)', 'C1 (advanced)'].map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </label>
      <label class="field">
        <span>Number of words</span>
        <input type="number" min={5} max={200} value={count} onChange={(e) => setCount(Number(e.currentTarget.value) || 40)} />
      </label>
      <pre class="prompt-preview">{prompt}</pre>
      <button
        class="btn primary wide"
        onClick={async () => {
          await navigator.clipboard.writeText(prompt);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? 'Copied ✓' : 'Copy AI prompt'}
      </button>
    </details>
  );
}

const NONE = -1;

function Preview(props: { parsed: ParsedImport; deckId?: number; onCancel: () => void; onDone: (r: Result) => void }) {
  const { parsed } = props;
  const decks = useLive(() => db.decks.orderBy('name').toArray(), []);
  const [targetDeck, setTargetDeck] = useState<number | 'new'>(props.deckId ?? 'new');
  const [name, setName] = useState(parsed.name ?? '');
  const [sourceLang, setSourceLang] = useState(parsed.sourceLang ?? guessLanguage(parsed.name) ?? '');
  const [targetLang, setTargetLang] = useState(parsed.targetLang ?? 'en');
  const [reverse, setReverse] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mappings, setMappings] = useState<Record<string, FieldMapping | null>>(() =>
    parsed.kind === 'raw' ? Object.fromEntries(parsed.noteTypes.map((t) => [t.name, guessMapping(t)])) : {},
  );

  const { notes, skipped } = useMemo<{ notes: ParsedNote[]; skipped: number }>(
    () => (parsed.kind === 'raw' ? applyMapping(parsed.rawNotes, mappings) : { notes: parsed.notes, skipped: 0 }),
    [parsed, mappings],
  );

  const isNew = targetDeck === 'new';
  const canImport = notes.length > 0 && (!isNew || (name.trim() && sourceLang && targetLang)) && !saving;

  async function save() {
    setSaving(true);
    try {
      const r = await saveImport(
        { deckId: isNew ? undefined : targetDeck, name, sourceLang, targetLang, reverse },
        notes,
        parsed.media,
      );
      props.onDone({ ...r, skipped });
    } catch (e) {
      alert(`Import failed: ${(e as Error).message}`);
      setSaving(false);
    }
  }

  return (
    <>
      {parsed.kind === 'raw' &&
        parsed.noteTypes.map((t) => (
          <MappingEditor
            key={t.name}
            fieldNames={t.fieldNames}
            title={parsed.noteTypes.length > 1 ? `${t.name} (${t.count})` : 'Fields'}
            sample={parsed.rawNotes.find((n) => n.noteType === t.name)?.fields ?? []}
            mapping={mappings[t.name]}
            canExclude={parsed.noteTypes.length > 1}
            onChange={(m) => setMappings({ ...mappings, [t.name]: m })}
          />
        ))}

      <section class="panel">
        <h2>
          Preview <span class="muted">({notes.length} words)</span>
        </h2>
        <ul class="list words preview">
          {notes.slice(0, 5).map((n, i) => (
            <li key={i}>
              <div>
                <span>{n.front}</span>
                <small>{n.back}</small>
                {n.example && <small class="muted">{n.example}</small>}
              </div>
              {n.audio && <span title="Has audio">🔊</span>}
            </li>
          ))}
        </ul>
        {parsed.warnings.length > 0 && (
          <details class="warnings">
            <summary>{parsed.warnings.length} warning(s)</summary>
            <ul>
              {parsed.warnings.slice(0, 50).map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section class="panel">
        <label class="field">
          <span>Import into</span>
          <select
            value={String(targetDeck)}
            onChange={(e) => setTargetDeck(e.currentTarget.value === 'new' ? 'new' : Number(e.currentTarget.value))}
          >
            <option value="new">New deck</option>
            {decks?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        {isNew && (
          <>
            <label class="field">
              <span>Deck name</span>
              <input value={name} onInput={(e) => setName(e.currentTarget.value)} placeholder="e.g. Spanish – Food" />
            </label>
            <LangSelect label="Front language (learning)" value={sourceLang} onChange={setSourceLang} />
            <LangSelect label="Back language (translation)" value={targetLang} onChange={setTargetLang} />
            <Toggle label="Reverse cards" hint="Also ask translation → word" checked={reverse} onChange={setReverse} />
          </>
        )}
      </section>

      <div class="row-buttons">
        <button class="btn" onClick={props.onCancel}>
          Back
        </button>
        <button class="btn primary" disabled={!canImport} onClick={save}>
          {saving ? 'Importing…' : `Import ${notes.length}`}
        </button>
      </div>
    </>
  );
}

function MappingEditor(props: {
  title: string;
  fieldNames: string[];
  sample: string[];
  mapping: FieldMapping | null;
  canExclude: boolean;
  onChange: (m: FieldMapping | null) => void;
}) {
  const m = props.mapping;
  const select = (label: string, key: keyof FieldMapping, optional: boolean) => (
    <label class="field">
      <span>{label}</span>
      <select value={m![key]} onChange={(e) => props.onChange({ ...m!, [key]: Number(e.currentTarget.value) })}>
        {optional && <option value={NONE}>{key === 'audio' ? 'Any field' : '—'}</option>}
        {props.fieldNames.map((f, i) => (
          <option key={i} value={i}>
            {f}
            {props.sample[i] ? ` · ${props.sample[i].slice(0, 30)}` : ''}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section class="panel">
      <h2>{props.title}</h2>
      {props.canExclude && <Toggle label="Include" checked={m !== null} onChange={(on) => props.onChange(on ? guessMappingFallback(props.fieldNames) : null)} />}
      {m && (
        <>
          {select('Front (word)', 'front', false)}
          {select('Back (translation)', 'back', false)}
          {select('Example', 'example', true)}
          {select('Example translation', 'exampleTranslation', true)}
          {select('Audio from', 'audio', true)}
        </>
      )}
    </section>
  );
}

const guessMappingFallback = (fieldNames: string[]) => guessMapping({ name: '', fieldNames, count: 0 });
