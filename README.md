# Vocab

A flashcard PWA for learning languages. It works offline, lives on your iPhone's Home Screen, and sends a daily push notification with a random word from a deck you choose.

- **Import:** `.apkg` deck packages (old and new formats, with audio), JSON (great for AI-generated decks), CSV/TSV
- **Study:** FSRS spaced repetition, optional reverse cards, typed-answer mode, pronunciation via text-to-speech
- **Daily word:** a GitHub Actions cron sends an empty push; the app picks the word on your phone, so your vocabulary never leaves the device
- **Backup:** export/restore everything as one file

## One-time setup

1. **Create the repo.** On GitHub, create a **public** repo named `vocab-pwa`, then push:
   ```bash
   git remote add origin https://github.com/<you>/vocab-pwa.git
   git push -u origin main
   ```
2. **Enable Pages.** Repo → Settings → Pages → Source: **GitHub Actions**. The deploy workflow publishes to `https://<you>.github.io/vocab-pwa/`.
3. **Add the private VAPID key.** Repo → Settings → Secrets and variables → Actions → New secret:
   - Name: `VAPID_PRIVATE_KEY`
   - Value: `privateKey` from `.secrets/vapid.json` (this file is git-ignored; keep it safe)
4. **Install on iPhone.** Open the Pages URL in Safari → Share → **Add to Home Screen** → open Vocab from the Home Screen.
5. **Enable the daily word.** In the app: Settings → Daily word → pick a deck → **Enable daily word** → allow notifications → open "Push subscription" → **Copy subscription**.
6. **Add the subscription.** New repo secret `PUSH_SUBSCRIPTION` with the copied JSON.
7. **Test.** Repo → Actions → Daily word → Run workflow (with "Send immediately" checked). A word should appear on your phone.

## Daily word time

Edit [`daily-word.config.json`](daily-word.config.json) (the GitHub web editor works from your phone):

```json
{ "time": "09:00", "timezone": "Europe/Berlin" }
```

The workflow runs hourly at :45; the run that owns the hour before your time waits until the exact minute and sends. Daylight saving time is handled automatically.

**If notifications stop:** the workflow fails and GitHub emails you. Usually the subscription expired: in the app, turn the daily word off and on, then update `PUSH_SUBSCRIPTION`.

## Making decks with AI

Import → "Create a deck with AI" builds a prompt for any AI chat. Paste the answer into Import → Paste. The format:

```json
{
  "format": "vocab-deck/1",
  "name": "Spanish – Food",
  "sourceLang": "es",
  "targetLang": "en",
  "cards": [
    { "front": "la manzana", "back": "the apple", "example": "Me como una manzana.", "exampleTranslation": "I eat an apple.", "tags": ["food"] }
  ]
}
```

Only `front` and `back` are required. CSV files use the header `front,back,example,exampleTranslation,tags` (tags separated by `;`); without a header, column 1 is front and column 2 is back.

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run build      # typecheck + production build
npm run icons      # regenerate app icons
```

`node scripts/send-daily-word.mjs --now` sends a push from your machine, using `.secrets/vapid.json` and `.secrets/subscription.json` (paste the copied subscription there).
