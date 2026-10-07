import { db } from '../db/schema';

const BACKUP_FORMAT = 'vocab-backup/1';

interface Backup {
  format: typeof BACKUP_FORMAT;
  exportedAt: string;
  tables: Record<string, unknown[]>;
  media: { name: string; deckId: number; type: string; data: string }[];
}

const TABLES = ['decks', 'notes', 'cards', 'reviews', 'settings', 'dailyWord'] as const;

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64ToBlob(data: string, type: string): Blob {
  const raw = atob(data);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Blob([bytes], { type });
}

export async function exportBackup(): Promise<File> {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = await db.table(t).toArray();
  const media = await Promise.all(
    (await db.media.toArray()).map(async (m) => ({ name: m.name, deckId: m.deckId, type: m.blob.type, data: await blobToBase64(m.blob) })),
  );
  const backup: Backup = { format: BACKUP_FORMAT, exportedAt: new Date().toISOString(), tables, media };
  const date = new Date().toISOString().slice(0, 10);
  return new File([JSON.stringify(backup)], `vocab-backup-${date}.json`, { type: 'application/json' });
}

/** Shares the file on iOS (Save to Files), or downloads it elsewhere. */
export async function saveFile(file: File): Promise<void> {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Replaces all data with the backup's contents. */
export async function restoreBackup(file: File): Promise<void> {
  const backup = JSON.parse(await file.text()) as Backup;
  if (backup.format !== BACKUP_FORMAT) throw new Error('This file is not a Vocab backup.');
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
    for (const t of TABLES) await db.table(t).bulkAdd(backup.tables[t] ?? []);
    await db.media.bulkAdd(backup.media.map((m) => ({ name: m.name, deckId: m.deckId, blob: base64ToBlob(m.data, m.type) })));
  });
}
