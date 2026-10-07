import { JSON_FORMAT_ID } from './json';

export function aiPrompt(opts: { learn: string; native: string; topic: string; count: number; level: string }): string {
  return `Create a vocabulary deck for learning ${opts.learn}. My native language is ${opts.native}.

Topic: ${opts.topic}
Level: ${opts.level}
Number of words: ${opts.count}

Reply with ONLY a JSON object in exactly this format, no explanation:

{
  "format": "${JSON_FORMAT_ID}",
  "name": "<short deck name>",
  "sourceLang": "<language code of ${opts.learn}, e.g. es>",
  "targetLang": "<language code of ${opts.native}, e.g. en>",
  "cards": [
    {
      "front": "<word or phrase in ${opts.learn}>",
      "back": "<translation in ${opts.native}>",
      "example": "<short natural example sentence in ${opts.learn}>",
      "exampleTranslation": "<translation of the example in ${opts.native}>",
      "tags": ["<topic>", "<part of speech>"]
    }
  ]
}

Rules:
- For nouns, include the article or gender in "front" (e.g. "el perro", "der Hund", "la maison").
- For verbs, use the infinitive; mention irregular forms in "back" in parentheses if useful.
- Give the most common translation first; separate alternatives with ", ".
- Keep example sentences short (under 12 words) and at the stated level.
- No duplicates.`;
}
