import { db } from '../db/schema';

let voices: SpeechSynthesisVoice[] = [];
if ('speechSynthesis' in window) {
  const load = () => (voices = speechSynthesis.getVoices());
  load();
  speechSynthesis.addEventListener?.('voiceschanged', load);
}

export const canSpeak = () => 'speechSynthesis' in window;

function voiceFor(lang: string): SpeechSynthesisVoice | undefined {
  const l = lang.toLowerCase();
  const matches = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(l));
  return matches.find((v) => v.localService && /premium|enhanced/i.test(v.name)) ?? matches.find((v) => v.default) ?? matches[0];
}

export function speak(text: string, lang: string): void {
  if (!canSpeak() || !text) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = lang;
  const v = voiceFor(lang);
  if (v) u.voice = v;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

let current: HTMLAudioElement | undefined;

/** Plays bundled audio if the note has it; returns false when there is none. */
export async function playMedia(name: string | undefined): Promise<boolean> {
  if (!name) return false;
  const row = await db.media.get(name);
  if (!row) return false;
  current?.pause();
  const url = URL.createObjectURL(row.blob);
  current = new Audio(url);
  current.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
  try {
    await current.play();
    return true;
  } catch {
    URL.revokeObjectURL(url);
    return false;
  }
}

/** Plays the note's recording, falling back to text-to-speech. */
export async function pronounce(text: string, lang: string, audio?: string): Promise<void> {
  if (!(await playMedia(audio))) speak(text, lang);
}
