import { unzipSync } from 'fflate';
import { decompress } from 'fzstd';
import type { Database, SqlJsStatic } from 'sql.js';
import { ImportError, type NoteType, type ParsedRaw, type RawNote } from '../types';
import { decodeMediaEntries } from './protobuf';
import { cleanField, extractSounds } from './clean';

const ZSTD_MAGIC = [0x28, 0xb5, 0x2f, 0xfd];
const isZstd = (b: Uint8Array) => ZSTD_MAGIC.every((v, i) => b[i] === v);
const maybeZstd = (b: Uint8Array) => (isZstd(b) ? decompress(b) : b);

/**
 * Parses a deck package (.apkg). The SQLite engine is passed in so the browser
 * can load its WASM lazily and tests can use the Node build.
 */
export function parseApkg(bytes: Uint8Array, SQL: SqlJsStatic): ParsedRaw {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    throw new ImportError('This file is not a valid deck package (it should be a zip archive).');
  }

  const dbName = pickCollection(Object.keys(files));
  if (!dbName) throw new ImportError('No card database found inside the deck package.');

  const db = new SQL.Database(maybeZstd(files[dbName]));
  try {
    const warnings: string[] = [];
    const types = readNoteTypes(db);
    const rawNotes: RawNote[] = [];
    const counts = new Map<string, number>();
    const sounds = new Set<string>();

    for (const [mid, flds, tags] of rows(db, 'SELECT mid, flds, tags FROM notes ORDER BY id')) {
      const type = types.get(Number(mid));
      const noteType = type?.name ?? 'Unknown';
      const parts = String(flds).split('\x1f');
      const audio = parts.map((f) => extractSounds(f)[0]);
      audio.forEach((a) => a && sounds.add(a));
      rawNotes.push({
        noteType,
        fields: parts.map(cleanField),
        audio,
        tags: String(tags).trim().split(/\s+/).filter(Boolean),
      });
      counts.set(noteType, (counts.get(noteType) ?? 0) + 1);
    }

    if (rawNotes.length === 0) throw new ImportError('The deck package contains no cards.');
    if (rawNotes.length === 1 && /update to the latest version/i.test(rawNotes[0].fields.join(' '))) {
      throw new ImportError('This deck package uses a format that could not be read.');
    }

    const noteTypes: NoteType[] = [];
    for (const t of types.values()) {
      const count = counts.get(t.name) ?? 0;
      if (count) noteTypes.push({ name: t.name, fieldNames: t.fieldNames, count });
    }
    if (counts.has('Unknown')) {
      const maxFields = Math.max(...rawNotes.filter((n) => n.noteType === 'Unknown').map((n) => n.fields.length));
      noteTypes.push({
        name: 'Unknown',
        fieldNames: Array.from({ length: maxFields }, (_, i) => `Field ${i + 1}`),
        count: counts.get('Unknown')!,
      });
    }
    noteTypes.sort((a, b) => b.count - a.count);

    const media = readMedia(files, sounds, warnings);
    return { kind: 'raw', name: readDeckName(db), noteTypes, rawNotes, media, warnings };
  } finally {
    db.close();
  }
}

/** Newer packages contain several databases; prefer the newest variant ("…21b" > "…21" > "…2"). */
function pickCollection(names: string[]): string | undefined {
  const score = (n: string) => {
    const m = n.match(/^collection\.[a-z]*?(\d+)(b?)$/i);
    return m ? Number(m[1]) * 10 + (m[2] ? 5 : 0) : -1;
  };
  return names
    .filter((n) => score(n) >= 0)
    .sort((a, b) => score(b) - score(a))[0];
}

function* rows(db: Database, sql: string): Generator<unknown[]> {
  const stmt = db.prepare(sql);
  try {
    while (stmt.step()) yield stmt.get();
  } finally {
    stmt.free();
  }
}

function hasTable(db: Database, name: string): boolean {
  const res = db.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [name]);
  return res.length > 0 && res[0].values.length > 0;
}

function readNoteTypes(db: Database): Map<number, { name: string; fieldNames: string[] }> {
  const out = new Map<number, { name: string; fieldNames: string[] }>();
  if (hasTable(db, 'notetypes') && hasTable(db, 'fields')) {
    for (const [id, name] of rows(db, 'SELECT id, name FROM notetypes')) {
      out.set(Number(id), { name: String(name), fieldNames: [] });
    }
    for (const [ntid, name] of rows(db, 'SELECT ntid, name FROM fields ORDER BY ntid, ord')) {
      out.get(Number(ntid))?.fieldNames.push(String(name));
    }
  }
  if (out.size === 0) {
    const [[modelsJson] = []] = [...rows(db, 'SELECT models FROM col')];
    if (modelsJson) {
      const models = JSON.parse(String(modelsJson)) as Record<string, { name: string; flds: { name: string; ord: number }[] }>;
      for (const [id, m] of Object.entries(models)) {
        const flds = [...m.flds].sort((a, b) => a.ord - b.ord);
        out.set(Number(id), { name: m.name, fieldNames: flds.map((f) => f.name) });
      }
    }
  }
  return out;
}

function readDeckName(db: Database): string | undefined {
  const [[did] = []] = [...rows(db, 'SELECT did FROM cards GROUP BY did ORDER BY count(*) DESC LIMIT 1')];
  if (did === undefined) return undefined;
  let name: string | undefined;
  if (hasTable(db, 'decks')) {
    const [[n] = []] = [...rows(db, `SELECT name FROM decks WHERE id = ${Number(did)}`)];
    if (n !== undefined) name = String(n);
  }
  if (name === undefined) {
    const [[decksJson] = []] = [...rows(db, 'SELECT decks FROM col')];
    if (decksJson) name = (JSON.parse(String(decksJson)) as Record<string, { name: string }>)[String(did)]?.name;
  }
  // Nested deck names are joined with "::" (older files) or \x1f (newer files).
  return name?.split(/::|\x1f/).pop()?.trim() || undefined;
}

function readMedia(files: Record<string, Uint8Array>, wanted: Set<string>, warnings: string[]): Map<string, Blob> {
  const media = new Map<string, Blob>();
  const mapFile = files['media'];
  if (!mapFile || wanted.size === 0) return media;

  let entries: { name: string; zipName: string }[];
  const raw = maybeZstd(mapFile);
  const text = new TextDecoder().decode(raw);
  if (text.trimStart().startsWith('{')) {
    entries = Object.entries(JSON.parse(text) as Record<string, string>).map(([zipName, name]) => ({ name, zipName }));
  } else {
    entries = decodeMediaEntries(raw);
  }

  let missing = 0;
  for (const { name, zipName } of entries) {
    if (!wanted.has(name)) continue;
    const data = files[zipName];
    if (!data) {
      missing++;
      continue;
    }
    // Copy into a fresh ArrayBuffer so the Blob doesn't pin the whole zip in memory.
    const bytes = maybeZstd(data).slice();
    media.set(name, new Blob([bytes.buffer as ArrayBuffer], { type: mimeFor(name) }));
  }
  if (missing) warnings.push(`${missing} audio file(s) referenced by the deck were missing.`);
  return media;
}

function mimeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  return (
    { mp3: 'audio/mpeg', m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', webm: 'audio/webm', flac: 'audio/flac' }[
      ext ?? ''
    ] ?? 'application/octet-stream'
  );
}
