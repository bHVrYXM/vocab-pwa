import { describe, expect, it } from 'vitest';
import { parseCsvDeck } from '../src/import/csv';
import { parseJsonDeck } from '../src/import/json';
import { diffAnswer } from '../src/app/screens/typedDiff';

describe('parseJsonDeck', () => {
  it('parses the deck format, even inside a code fence', () => {
    const json = '```json\n{"format":"vocab-deck/1","name":"Food","sourceLang":"es","targetLang":"en","cards":[{"front":"la manzana","back":"the apple","tags":["food"]},{"front":"","back":"x"}]}\n```';
    const d = parseJsonDeck(json);
    expect(d).toMatchObject({ name: 'Food', sourceLang: 'es', targetLang: 'en' });
    expect(d.notes).toEqual([{ front: 'la manzana', back: 'the apple', example: undefined, exampleTranslation: undefined, tags: ['food'] }]);
    expect(d.warnings).toEqual(['Card 2: missing front, skipped.']);
  });

  it('accepts a bare array', () => {
    expect(parseJsonDeck('[{"front":"a","back":"b"}]').notes).toHaveLength(1);
  });

  it('reports invalid JSON', () => {
    expect(() => parseJsonDeck('{nope')).toThrow(/not valid JSON/);
  });
});

describe('parseCsvDeck', () => {
  it('uses the header and handles quotes', () => {
    const d = parseCsvDeck('front,back,example,tags\n"hola, amigo","hi, friend","Dijo ""hola"".",greeting;A1\nadiós,bye,,\n');
    expect(d.notes[0]).toEqual({ front: 'hola, amigo', back: 'hi, friend', example: 'Dijo "hola".', exampleTranslation: undefined, tags: ['greeting', 'A1'] });
    expect(d.notes[1]).toMatchObject({ front: 'adiós', back: 'bye', tags: [] });
  });

  it('treats headerless TSV as front/back', () => {
    const d = parseCsvDeck('der Hund\tthe dog\r\ndie Katze\tthe cat');
    expect(d.notes.map((n) => n.front)).toEqual(['der Hund', 'die Katze']);
  });
});

describe('diffAnswer', () => {
  it('accepts any comma-separated alternative, ignoring case', () => {
    expect(diffAnswer('Home', 'the house, home').correct).toBe(true);
  });

  it('treats accents as significant', () => {
    const r = diffAnswer('adios', 'adiós');
    expect(r.correct).toBe(false);
    expect(r.parts).toEqual([
      { kind: 'same', text: 'adi' },
      { kind: 'missing', text: 'ó' },
      { kind: 'extra', text: 'o' },
      { kind: 'same', text: 's' },
    ]);
  });
});
