export interface ParsedNote {
  front: string;
  back: string;
  example?: string;
  exampleTranslation?: string;
  /** Media file name, present in ParsedDeck.media when bundled. */
  audio?: string;
  tags: string[];
}

/** A note before its fields have been assigned to front/back/etc. (used by .apkg). */
export interface RawNote {
  noteType: string;
  fields: string[];
  audio: (string | undefined)[];
  tags: string[];
}

export interface NoteType {
  name: string;
  fieldNames: string[];
  count: number;
}

export interface FieldMapping {
  front: number;
  back: number;
  /** -1 means "none". */
  example: number;
  exampleTranslation: number;
  /** Field to take audio from; -1 means "any field". */
  audio: number;
}

interface ParsedBase {
  name?: string;
  sourceLang?: string;
  targetLang?: string;
  media: Map<string, Blob>;
  warnings: string[];
}

export interface ParsedMapped extends ParsedBase {
  kind: 'mapped';
  notes: ParsedNote[];
}

export interface ParsedRaw extends ParsedBase {
  kind: 'raw';
  noteTypes: NoteType[];
  rawNotes: RawNote[];
}

export type ParsedImport = ParsedMapped | ParsedRaw;

export class ImportError extends Error {}
