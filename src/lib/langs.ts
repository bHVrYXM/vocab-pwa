export const LANGUAGES = [
  'ar', 'bg', 'cs', 'da', 'de', 'el', 'en', 'es', 'et', 'fa', 'fi', 'fr', 'he', 'hi', 'hr', 'hu', 'id', 'it', 'ja', 'ko',
  'lt', 'lv', 'nb', 'nl', 'pl', 'pt', 'ro', 'ru', 'sk', 'sl', 'sr', 'sv', 'sw', 'th', 'tr', 'uk', 'vi', 'zh',
];

const names = new Intl.DisplayNames(['en'], { type: 'language' });

export function languageName(code: string): string {
  try {
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

export const sortedLanguages = () =>
  [...LANGUAGES].sort((a, b) => languageName(a).localeCompare(languageName(b)));

/** Guesses a language from a deck name like "Spanish – Food" or "Deutsch A1". */
export function guessLanguage(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const lower = text.toLowerCase();
  const native = new Map<string, string>([
    ['español', 'es'], ['deutsch', 'de'], ['français', 'fr'], ['italiano', 'it'], ['português', 'pt'],
    ['nederlands', 'nl'], ['polski', 'pl'], ['svenska', 'sv'], ['русский', 'ru'], ['日本語', 'ja'], ['中文', 'zh'], ['한국어', 'ko'],
  ]);
  for (const [word, code] of native) if (lower.includes(word)) return code;
  return LANGUAGES.find((code) => lower.includes(languageName(code).toLowerCase()));
}
