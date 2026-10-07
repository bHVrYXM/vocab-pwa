import { ImportError, type ParsedMapped, type ParsedNote } from './types';

const COLUMNS = ['front', 'back', 'example', 'exampletranslation', 'tags'] as const;

export function parseCsvDeck(text: string): ParsedMapped {
  text = text.replace(/^﻿/, '');
  const delimiter = detectDelimiter(text);
  const rows = parseRows(text, delimiter).filter((r) => r.some((c) => c.trim()));
  if (rows.length === 0) throw new ImportError('The file is empty.');

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/[\s_-]/g, ''));
  const hasHeader = header.includes('front') && header.includes('back');
  const col = (name: (typeof COLUMNS)[number], fallback: number) =>
    hasHeader ? header.indexOf(name) : fallback;
  const idx = {
    front: col('front', 0),
    back: col('back', 1),
    example: col('example', -1),
    exampleTranslation: col('exampletranslation', -1),
    tags: col('tags', -1),
  };

  const warnings: string[] = [];
  const notes: ParsedNote[] = [];
  const body = hasHeader ? rows.slice(1) : rows;
  body.forEach((row, i) => {
    const get = (j: number) => (j >= 0 ? (row[j] ?? '').trim() : '');
    const front = get(idx.front);
    const back = get(idx.back);
    const line = i + (hasHeader ? 2 : 1);
    if (!front || !back) {
      warnings.push(`Row ${line}: missing ${!front ? 'front' : 'back'}, skipped.`);
      return;
    }
    notes.push({
      front,
      back,
      example: get(idx.example) || undefined,
      exampleTranslation: get(idx.exampleTranslation) || undefined,
      tags: get(idx.tags)
        .split(/[;|]/)
        .map((t) => t.trim())
        .filter(Boolean),
    });
  });

  return { kind: 'mapped', notes, media: new Map(), warnings };
}

function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const counts = ['\t', ';', ','].map((d) => [d, firstLine.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ',';
}

/** RFC 4180-style parsing: quoted fields, doubled quotes, newlines inside quotes. */
function parseRows(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
