import { zipSync } from 'fflate';
import initSqlJs, { type SqlJsStatic } from 'sql.js';
import { beforeAll, describe, expect, it } from 'vitest';
import { zstdCompressSync } from 'node:zlib';
import { parseApkg } from '../src/import/apkg/parse';
import { applyMapping, guessMapping } from '../src/import/mapping';

let SQL: SqlJsStatic;
beforeAll(async () => {
  SQL = await initSqlJs();
});

const enc = new TextEncoder();
const zstd = (b: Uint8Array) => new Uint8Array(zstdCompressSync(b));

// Real packages put a vendor prefix before the version suffix; the parser only relies on the suffix.
const COLLECTION_V2 = 'collection.db2';
const COLLECTION_V21B = 'collection.db21b';

const NOTES = [
  ['el perro', 'the dog', 'El perro duerme.', '[sound:perro.mp3]'],
  ['la casa', 'the &amp; house<br>home', '', ''],
  ['<b>comer</b>', 'to eat', 'Vamos a comer.', '[sound:comer.mp3]'],
];

function legacyCollection(): Uint8Array {
  const db = new SQL.Database();
  db.run('CREATE TABLE col (models TEXT, decks TEXT)');
  db.run('CREATE TABLE notes (id INTEGER, mid INTEGER, flds TEXT, tags TEXT)');
  db.run('CREATE TABLE cards (id INTEGER, nid INTEGER, did INTEGER)');
  const models = { '111': { name: 'Vocab', flds: [{ name: 'Word', ord: 0 }, { name: 'Meaning', ord: 1 }, { name: 'Example', ord: 2 }, { name: 'Audio', ord: 3 }] } };
  const decks = { '1': { name: 'Default' }, '7': { name: 'Spanish::Basics' } };
  db.run('INSERT INTO col VALUES (?, ?)', [JSON.stringify(models), JSON.stringify(decks)]);
  NOTES.forEach((f, i) => {
    db.run('INSERT INTO notes VALUES (?, 111, ?, ?)', [i + 1, f.join('\x1f'), ' animals A1 ']);
    db.run('INSERT INTO cards VALUES (?, ?, 7)', [i + 1, i + 1]);
  });
  const out = db.export();
  db.close();
  return out;
}

function newCollection(): Uint8Array {
  const db = new SQL.Database();
  db.run('CREATE TABLE col (models TEXT, decks TEXT)');
  db.run("INSERT INTO col VALUES ('{}', '{}')");
  db.run('CREATE TABLE notetypes (id INTEGER, name TEXT)');
  db.run('CREATE TABLE fields (ntid INTEGER, ord INTEGER, name TEXT)');
  db.run('CREATE TABLE decks (id INTEGER, name TEXT)');
  db.run('CREATE TABLE notes (id INTEGER, mid INTEGER, flds TEXT, tags TEXT)');
  db.run('CREATE TABLE cards (id INTEGER, nid INTEGER, did INTEGER)');
  db.run("INSERT INTO notetypes VALUES (222, 'Basic')");
  db.run("INSERT INTO fields VALUES (222, 1, 'Back'), (222, 0, 'Front')");
  db.run('INSERT INTO decks VALUES (9, ?)', ['Languages\x1fFrench']);
  db.run('INSERT INTO notes VALUES (1, 222, ?, ?)', [['le chat [sound:chat.mp3]', 'the cat'].join('\x1f'), '']);
  db.run('INSERT INTO cards VALUES (1, 1, 9)');
  const out = db.export();
  db.close();
  return out;
}

// protobuf: MediaEntries { repeated MediaEntry entries = 1 } / MediaEntry { string name = 1; uint32 size = 2; }
function encodeMedia(names: string[]): Uint8Array {
  const bytes: number[] = [];
  for (const name of names) {
    const n = [...enc.encode(name)];
    const entry = [0x0a, n.length, ...n, 0x10, 3];
    bytes.push(0x0a, entry.length, ...entry);
  }
  return new Uint8Array(bytes);
}

describe('parseApkg', () => {
  it('reads older packages with JSON note types and media map', () => {
    const zip = zipSync({
      [COLLECTION_V2]: legacyCollection(),
      media: enc.encode(JSON.stringify({ '0': 'perro.mp3', '1': 'comer.mp3', '2': 'unused.jpg' })),
      '0': new Uint8Array([1, 2, 3]),
      '1': new Uint8Array([4, 5]),
      '2': new Uint8Array([9]),
    });
    const parsed = parseApkg(zip, SQL);
    expect(parsed.name).toBe('Basics');
    expect(parsed.noteTypes).toEqual([{ name: 'Vocab', fieldNames: ['Word', 'Meaning', 'Example', 'Audio'], count: 3 }]);
    expect(parsed.rawNotes[1].fields[1]).toBe('the & house\nhome');
    expect(parsed.rawNotes[2].fields[0]).toBe('comer');
    expect(parsed.rawNotes[0].tags).toEqual(['animals', 'A1']);
    expect([...parsed.media.keys()].sort()).toEqual(['comer.mp3', 'perro.mp3']);
    expect(parsed.media.get('perro.mp3')!.type).toBe('audio/mpeg');

    const mapping = guessMapping(parsed.noteTypes[0]);
    expect(mapping).toMatchObject({ front: 0, back: 1, example: 2 });
    const { notes } = applyMapping(parsed.rawNotes, { Vocab: mapping });
    expect(notes[0]).toMatchObject({ front: 'el perro', back: 'the dog', example: 'El perro duerme.', audio: 'perro.mp3' });
    expect(notes[1].example).toBeUndefined();
  });

  it('prefers the newest zstd database and decodes the protobuf media map', () => {
    const zip = zipSync({
      [COLLECTION_V2]: legacyCollection(), // older placeholder db: must be ignored
      [COLLECTION_V21B]: zstd(newCollection()),
      media: zstd(encodeMedia(['chat.mp3'])),
      '0': zstd(new Uint8Array([7, 7, 7])),
    });
    const parsed = parseApkg(zip, SQL);
    expect(parsed.name).toBe('French');
    expect(parsed.noteTypes[0].fieldNames).toEqual(['Front', 'Back']);
    expect(parsed.rawNotes[0].fields).toEqual(['le chat', 'the cat']);
    expect(parsed.rawNotes[0].audio[0]).toBe('chat.mp3');
    expect(parsed.media.get('chat.mp3')!.size).toBe(3);
  });

  it('rejects files that are not zip archives', () => {
    expect(() => parseApkg(enc.encode('hello'), SQL)).toThrow(/not a valid deck package/);
  });
});
